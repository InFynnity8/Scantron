"""Sheet localisation and perspective correction.

Strategy, from most to least reliable:

1. ArUco fiducials (built-in sheets). Each marker gives 4 sub-pixel corners and
   an ID, so >=3 visible markers give an exact, rotation-proof homography
   (RANSAC over up to 16 points) and identify the template.
2. Page quadrilateral. The largest convex 4-gon (paper edge) is found with
   several edge/threshold strategies and warped to the template page.
3. Per-block refinement. Each bubble block is nudged by template matching
   against its expected bubble rings to absorb residual print/paper offsets.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .imageops import limit_size, to_gray
from .template import Item, Template


class SheetNotFoundError(ValueError):
    pass


@dataclass
class MarkerDetection:
    ids: list[int]
    corners: dict[int, np.ndarray]  # id -> (4,2) in source image px


@dataclass
class Aligned:
    image: np.ndarray  # BGR sheet, template resolution
    gray: np.ndarray
    method: str
    homography: np.ndarray  # source px -> template px
    source_quad: np.ndarray  # (4,2) page outline in the source image
    detail: dict = field(default_factory=dict)


_DETECTORS: dict[str, cv2.aruco.ArucoDetector] = {}


def _detector(dictionary: str) -> cv2.aruco.ArucoDetector:
    if dictionary not in _DETECTORS:
        params = cv2.aruco.DetectorParameters()
        params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
        params.adaptiveThreshWinSizeMin = 5
        params.adaptiveThreshWinSizeMax = 45
        params.adaptiveThreshWinSizeStep = 8
        params.minMarkerPerimeterRate = 0.02
        dic = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dictionary))
        _DETECTORS[dictionary] = cv2.aruco.ArucoDetector(dic, params)
    return _DETECTORS[dictionary]


def detect_markers(img: np.ndarray, dictionary: str = "DICT_4X4_100") -> MarkerDetection:
    gray = to_gray(img)
    found: dict[int, np.ndarray] = {}
    # Try a fast downscaled pass first, then full resolution / contrast boosted.
    passes = []
    h, w = gray.shape
    if max(h, w) > 1800:
        s = 1800 / max(h, w)
        passes.append((cv2.resize(gray, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA), s))
    passes.append((gray, 1.0))
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    passes.append((clahe.apply(gray), 1.0))
    det = _detector(dictionary)
    for g, s in passes:
        corners, ids, _ = det.detectMarkers(g)
        if ids is not None:
            for c, i in zip(corners, ids.flatten()):
                found.setdefault(int(i), c.reshape(4, 2) / s)
        if len(found) >= 4:
            break
    return MarkerDetection(sorted(found), found)


def _warp(img: np.ndarray, H: np.ndarray, t: Template) -> np.ndarray:
    return cv2.warpPerspective(
        img, H, (t.width, t.height), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE
    )


def _page_quad_from_h(H: np.ndarray, t: Template) -> np.ndarray:
    page = np.float32([[0, 0], [t.width, 0], [t.width, t.height], [0, t.height]]).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(page, np.linalg.inv(H)).reshape(4, 2)


def align_with_markers(img: np.ndarray, t: Template, det: MarkerDetection) -> Aligned | None:
    src, dst = [], []
    for mid, corners in det.corners.items():
        if mid in t.alignment.markers:
            src.append(corners)
            dst.append(t.alignment.markers[mid])
    if len(src) < 3:
        return None
    src_a, dst_a = np.concatenate(src).astype(np.float32), np.concatenate(dst).astype(np.float32)
    H, inliers = cv2.findHomography(src_a, dst_a, cv2.RANSAC, 4.0)
    if H is None:
        return None
    warped = _warp(img, H, t)
    reproj = cv2.perspectiveTransform(src_a.reshape(-1, 1, 2), H).reshape(-1, 2)
    err = float(np.sqrt(np.mean(np.sum((reproj - dst_a) ** 2, axis=1))))
    return Aligned(
        warped,
        to_gray(warped),
        "markers",
        H,
        _page_quad_from_h(H, t),
        {"markers_used": len(src), "reprojection_error_px": round(err, 2)},
    )


# --------------------------------------------------------------------------- #
# Feature registration against a reference image of the blank sheet
# --------------------------------------------------------------------------- #

_REF_CACHE: dict[int, tuple] = {}
_FEAT_SIDE = 1400


def _sift():
    return cv2.SIFT_create(nfeatures=5000, contrastThreshold=0.02)


def _reference_features(ref: np.ndarray):
    key = id(ref)
    if key not in _REF_CACHE:
        s = _FEAT_SIDE / max(ref.shape)
        small = cv2.resize(ref, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else ref
        s = min(s, 1.0)
        kp, des = _sift().detectAndCompute(small, None)
        pts = np.float32([k.pt for k in kp]) / s
        _REF_CACHE[key] = (pts, des)
    return _REF_CACHE[key]


def align_with_features(img: np.ndarray, t: Template) -> Aligned | None:
    ref = t.alignment.reference
    if ref is None:
        return None
    ref_pts, ref_des = _reference_features(ref)
    if ref_des is None or len(ref_pts) < 10:
        return None
    gray = to_gray(img)
    s = min(1.0, _FEAT_SIDE / max(gray.shape))
    small = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else gray
    kp, des = _sift().detectAndCompute(small, None)
    if des is None or len(kp) < 10:
        return None
    img_pts = np.float32([k.pt for k in kp]) / s

    matcher = cv2.FlannBasedMatcher({"algorithm": 1, "trees": 5}, {"checks": 64})
    matches = matcher.knnMatch(des, ref_des, k=2)
    good = [m[0] for m in matches if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
    if len(good) < 12:
        return None
    src = img_pts[[m.queryIdx for m in good]]
    dst = ref_pts[[m.trainIdx for m in good]]
    H, mask = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, 5.0, maxIters=5000, confidence=0.999)
    if H is None:
        return None
    inliers = int(mask.sum()) if mask is not None else 0
    if inliers < 12 or inliers < 0.15 * len(good):
        return None
    # Sanity: the page must map to a sensible convex quad in the photo.
    quad = _page_quad_from_h(H, t)
    if not cv2.isContourConvex(quad.astype(np.int32)):
        return None
    warped = _warp(img, H, t)
    return Aligned(warped, to_gray(warped), "features", H, quad, {"matches": len(good), "inliers": inliers})


# --------------------------------------------------------------------------- #
# Page (paper edge) detection
# --------------------------------------------------------------------------- #


def order_quad(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]])


def _quad_ok(q: np.ndarray, area_img: float, min_frac: float) -> bool:
    area = cv2.contourArea(q)
    if area < min_frac * area_img or not cv2.isContourConvex(q.astype(np.int32)):
        return False
    # Reject degenerate shapes: every interior angle between 45 and 135 deg.
    for i in range(4):
        a, b, c = q[i - 1], q[i], q[(i + 1) % 4]
        v1, v2 = a - b, c - b
        cosang = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        if abs(cosang) > 0.71:
            return False
    return True


def find_page_quad(img: np.ndarray, min_frac: float = 0.18) -> np.ndarray | None:
    """Find the paper outline. Returns ordered TL,TR,BR,BL in source px."""
    small = limit_size(img, 900)
    scale = img.shape[1] / small.shape[1]
    gray = to_gray(small)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    area_img = gray.shape[0] * gray.shape[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))

    candidates = []
    # Strategy A: Canny edges, closed.
    for lo, hi in ((30, 90), (60, 180), (15, 50)):
        e = cv2.Canny(blur, lo, hi)
        candidates.append(cv2.dilate(e, kernel, iterations=1))
    # Strategy B: bright-paper segmentation (Otsu) - works when edges are weak.
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates.append(cv2.morphologyEx(otsu, cv2.MORPH_CLOSE, kernel, iterations=3))

    best, best_area = None, 0.0
    for binimg in candidates:
        contours, _ = cv2.findContours(binimg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(contours, key=cv2.contourArea, reverse=True)[:6]:
            peri = cv2.arcLength(c, True)
            for eps in (0.015, 0.025, 0.04):
                approx = cv2.approxPolyDP(c, eps * peri, True)
                if len(approx) == 4:
                    break
            else:
                hull = cv2.convexHull(c)
                approx = cv2.approxPolyDP(hull, 0.03 * cv2.arcLength(hull, True), True)
                if len(approx) != 4:
                    continue
            q = approx.reshape(4, 2).astype(np.float32)
            a = cv2.contourArea(q)
            if a > best_area and _quad_ok(q, area_img, min_frac):
                # Ignore quads that are just the whole frame border.
                if a > 0.985 * area_img:
                    continue
                best, best_area = q, a
        if best is not None and best_area > 0.35 * area_img:
            break
    if best is None:
        return None
    return order_quad(best * scale)


def _orient_for_template(quad: np.ndarray, t: Template) -> np.ndarray:
    """If the page is landscape in the photo but the template portrait, rotate corner order."""
    w = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
    h = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
    if (w > h) != (t.width > t.height):
        quad = np.roll(quad, -1, axis=0)  # rotate 90deg; reader validates further
    return quad


def align_with_page(img: np.ndarray, t: Template) -> Aligned | None:
    quad = find_page_quad(img)
    if quad is None:
        return None
    quad = _orient_for_template(quad, t)
    dst = np.float32([[0, 0], [t.width, 0], [t.width, t.height], [0, t.height]])
    H = cv2.getPerspectiveTransform(quad, dst)
    warped = _warp(img, H, t)
    return Aligned(warped, to_gray(warped), "page", H, quad, {})


def align_whole_image(img: np.ndarray, t: Template) -> Aligned:
    h, w = img.shape[:2]
    quad = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[0, 0], [t.width, 0], [t.width, t.height], [0, t.height]])
    H = cv2.getPerspectiveTransform(quad, dst)
    warped = _warp(img, H, t)
    return Aligned(warped, to_gray(warped), "none", H, quad, {})


# --------------------------------------------------------------------------- #
# Block refinement
# --------------------------------------------------------------------------- #


def refine_blocks(
    dark: np.ndarray, t: Template, items: list[Item], max_shift: float
) -> tuple[list[Item], dict[int, tuple[int, int]]]:
    """Shift each block so that its bubble rings line up with the image.

    Uses normalised cross-correlation between the block's ink map and a
    synthetic ring pattern. Returns shifted items and the shift per block.
    """
    r = t.bubble_radius
    pad = int(np.ceil(max_shift))
    shifts: dict[int, tuple[int, int]] = {}
    if pad < 1:
        return items, shifts
    by_block: dict[int, list[Item]] = {}
    for it in items:
        by_block.setdefault(it.block, []).append(it)

    H, W = dark.shape
    for b_idx, its in by_block.items():
        x0, y0, x1, y1 = t.blocks[b_idx].bbox
        x0, y0 = int(x0 - 3), int(y0 - 3)
        x1, y1 = int(np.ceil(x1 + 3)), int(np.ceil(y1 + 3))
        if x0 - pad < 0 or y0 - pad < 0 or x1 + pad > W or y1 + pad > H:
            continue
        tmpl = np.zeros((y1 - y0, x1 - x0), np.float32)
        for it in its:
            for cx, cy in it.centers:
                cv2.circle(tmpl, (int(round(cx - x0)), int(round(cy - y0))), int(round(r)), 1.0, 2, cv2.LINE_AA)
        region = dark[y0 - pad : y1 + pad, x0 - pad : x1 + pad]
        # Clip ink so solid fills don't dominate the ring evidence.
        region = np.minimum(region, 0.5).astype(np.float32)
        res = cv2.matchTemplate(region, tmpl, cv2.TM_CCOEFF_NORMED)
        _, best, _, loc = cv2.minMaxLoc(res)
        zero = float(res[pad, pad])
        dx, dy = loc[0] - pad, loc[1] - pad
        if best > zero + 0.02 and best > 0.15:
            shifts[b_idx] = (dx, dy)
    out = [it.shifted(*shifts[it.block]) if it.block in shifts else it for it in items]
    return out, shifts
