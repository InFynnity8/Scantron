"""Synthetic answer-sheet photos for testing the OMR engine end to end."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from scantron_omr.render import render_sheet
from scantron_omr.template import Item, Template

SCALE = 2.0  # render at 300 DPI, like a real print


@dataclass
class Marks:
    answers: dict[str, list[str]] = field(default_factory=dict)  # label -> options
    student_id: str | None = None
    styles: dict[tuple[str, str], str] = field(default_factory=dict)  # (label, opt) -> style
    erased: list[tuple[str, str]] = field(default_factory=list)


def random_marks(t: Template, rng: np.random.Generator, blank_rate=0.0, multi_rate=0.0) -> Marks:
    m = Marks()
    for q in t.questions:
        u = rng.random()
        if u < blank_rate:
            m.answers[q.label] = []
        elif u < blank_rate + multi_rate:
            m.answers[q.label] = list(rng.choice(q.options, 2, replace=False))
        else:
            m.answers[q.label] = [str(rng.choice(q.options))]
    if t.id_columns:
        m.student_id = "".join(str(rng.integers(0, 10)) for _ in t.id_columns)
    return m


def _pencil(img: np.ndarray, cx: float, cy: float, r: float, rng, style: str = "full") -> None:
    """Draw a hand-made mark at (cx, cy) in render px (works on a local patch)."""
    pad = int(r * 1.6)
    x0, y0 = max(0, int(cx) - pad), max(0, int(cy) - pad)
    x1, y1 = min(img.shape[1], int(cx) + pad), min(img.shape[0], int(cy) + pad)
    roi = img[y0:y1, x0:x1]
    h, w = roi.shape[:2]
    lx, ly = cx - x0, cy - y0
    mask = np.zeros((h, w), np.uint8)
    jitter = rng.normal(0, r * 0.06, 2)
    lx, ly = lx + jitter[0], ly + jitter[1]
    if style in ("full", "faint", "pen"):
        rx, ry = r * rng.uniform(0.82, 1.02), r * rng.uniform(0.78, 1.0)
        cv2.ellipse(mask, (int(lx), int(ly)), (int(rx), int(ry)), rng.uniform(0, 180), 0, 360, 255, -1, cv2.LINE_AA)
    elif style == "partial":
        cv2.ellipse(mask, (int(lx), int(ly)), (int(r * 0.7), int(r * 0.55)), rng.uniform(0, 180), 0, 360, 255, -1, cv2.LINE_AA)
    elif style == "erased":
        cv2.ellipse(mask, (int(lx), int(ly)), (int(r * 0.9), int(r * 0.85)), 0, 0, 360, 255, -1, cv2.LINE_AA)
    elif style == "tick":
        pts = np.int32([[lx - r * 0.5, ly], [lx - r * 0.1, ly + r * 0.45], [lx + r * 0.55, ly - r * 0.5]])
        cv2.polylines(mask, [pts], False, 255, max(2, int(r * 0.18)), cv2.LINE_AA)
    level = {
        "full": rng.uniform(40, 95),  # graphite
        "pen": rng.uniform(20, 50),
        "faint": rng.uniform(120, 145),
        "partial": rng.uniform(50, 90),
        "erased": rng.uniform(205, 218),
        "tick": rng.uniform(30, 70),
    }[style]
    tex = np.full((h, w), level, np.float32)
    if style != "erased":
        tex = np.clip(tex + rng.normal(0, 18, (h, w)), 0, 255)
    a = (cv2.GaussianBlur(mask, (0, 0), 0.8).astype(np.float32) / 255.0)[..., None]
    roi[:] = (roi * (1 - a) + np.minimum(roi, tex[..., None]) * a).astype(np.uint8)


def draw_marks(t: Template, m: Marks, rng: np.random.Generator) -> np.ndarray:
    page = np.asarray(render_sheet(t, scale=SCALE)).copy()
    page = cv2.cvtColor(page, cv2.COLOR_RGB2BGR)
    r = t.bubble_radius * SCALE

    def center(it: Item, opt: str):
        j = it.options.index(opt)
        return it.centers[j] * SCALE

    for q in t.questions:
        for opt in m.answers.get(q.label, []):
            style = m.styles.get((q.label, opt), "full")
            _pencil(page, *center(q, opt), r, rng, style)
    for (label, opt) in m.erased:
        q = next(q for q in t.questions if q.label == label)
        _pencil(page, *center(q, opt), r, rng, "erased")
    if m.student_id:
        for col, d in zip(t.id_columns, m.student_id):
            _pencil(page, *center(col, d), r, rng, "full")
    return page


@dataclass
class PhotoParams:
    out_w: int = 2400
    out_h: int = 3200
    fill: float = 0.80  # fraction of frame height the sheet occupies
    persp: float = 0.06  # corner jitter as fraction of size
    rotation: float = 0.0  # degrees (in-plane)
    shadow: float = 0.35  # 0..1 strength of a soft shadow
    gradient: float = 0.30  # 0..1 lighting falloff
    blur: float = 1.2  # gaussian sigma (out px)
    noise: float = 4.0
    jpeg: int = 85
    background: tuple[int, int, int] = (70, 85, 95)
    tint: tuple[float, float, float] = (1.0, 0.98, 0.93)  # warm indoor light


def photograph(page: np.ndarray, p: PhotoParams, rng: np.random.Generator) -> np.ndarray:
    H, W = p.out_h, p.out_w
    ph, pw = page.shape[:2]
    sh = p.fill * H
    sw = sh * pw / ph
    # Keep the whole (rotated) sheet inside the frame, like a real photo.
    th0 = np.deg2rad(p.rotation)
    bw = abs(sw * np.cos(th0)) + abs(sh * np.sin(th0))
    bh = abs(sw * np.sin(th0)) + abs(sh * np.cos(th0))
    k = min(1.0, 0.94 * W / bw, 0.94 * H / bh)
    sh, sw = sh * k, sw * k
    cx, cy = W / 2 + rng.uniform(-0.04, 0.04) * W, H / 2 + rng.uniform(-0.03, 0.03) * H
    base = np.float32([[-sw / 2, -sh / 2], [sw / 2, -sh / 2], [sw / 2, sh / 2], [-sw / 2, sh / 2]])
    th = np.deg2rad(p.rotation)
    R = np.float32([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    dst = base @ R.T + np.float32([cx, cy])
    dst += rng.uniform(-p.persp, p.persp, (4, 2)).astype(np.float32) * np.float32([sw, sh])
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    M = cv2.getPerspectiveTransform(src, dst)

    bg = np.empty((H, W, 3), np.uint8)
    bg[:] = p.background
    bg = np.clip(bg + rng.normal(0, 10, (H, W, 1)), 0, 255).astype(np.uint8)
    bg = cv2.GaussianBlur(bg, (0, 0), 3)
    out = cv2.warpPerspective(page, M, (W, H), dst=bg, borderMode=cv2.BORDER_TRANSPARENT, flags=cv2.INTER_AREA)
    out = out.astype(np.float32)

    # Lighting: gradient + soft shadow blob + colour tint.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = rng.uniform(0, 2 * np.pi)
    g = (np.cos(ang) * (xx / W - 0.5) + np.sin(ang) * (yy / H - 0.5)) * 2
    light = 1.0 - p.gradient * (g + 1) / 2
    if p.shadow > 0:
        sx, sy = rng.uniform(0.2, 0.8) * W, rng.uniform(0.2, 0.8) * H
        rad = rng.uniform(0.25, 0.45) * W
        blob = np.exp(-(((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * rad**2)))
        light *= 1.0 - p.shadow * blob
    out *= light[..., None] * np.float32(p.tint)[None, None, ::-1]
    if p.blur > 0:
        out = cv2.GaussianBlur(out, (0, 0), p.blur)
    out += rng.normal(0, p.noise, out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, p.jpeg])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def expected_answers(m: Marks) -> dict[str, list[str]]:
    return {k: sorted(v) for k, v in m.answers.items()}


def read_answers(result: dict) -> dict[str, list[str]]:
    return {q["label"]: sorted(q["marked"]) for q in result["questions"]}
