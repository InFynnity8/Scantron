"""Template-free bubble discovery.

Used for

* ``auto`` mode: grade an arbitrary MCQ sheet with no template, and
* calibration: turn a photo/scan of a *blank* third-party sheet (e.g. KNUST)
  into a precise JSON template.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import cv2
import numpy as np

from .imageops import to_gray


@dataclass
class Blob:
    x: float
    y: float
    w: float
    h: float

    @property
    def r(self) -> float:
        return (self.w + self.h) / 4


def find_bubbles(gray: np.ndarray, min_size: int = 9, max_frac: float = 0.14) -> list[Blob]:
    """Find bubble-shaped contours (circles/ovals/rounded boxes) of similar size."""
    g = to_gray(gray)
    block = max(15, (min(g.shape) // 40) | 1)
    th = cv2.adaptiveThreshold(
        cv2.GaussianBlur(g, (3, 3), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 8
    )
    contours, _ = cv2.findContours(th, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    max_size = max_frac * max(g.shape)
    cands: list[Blob] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < min_size or h < min_size or w > max_size or h > max_size:
            continue
        ar = w / h
        if not 0.6 <= ar <= 1.7:
            continue
        area = cv2.contourArea(c)
        peri = cv2.arcLength(c, True)
        if peri == 0 or area < 0.5 * w * h:
            continue
        circ = 4 * np.pi * area / (peri * peri)
        if circ < 0.55:
            continue
        m = cv2.moments(c)
        if m["m00"] == 0:
            continue
        cands.append(Blob(m["m10"] / m["m00"], m["m01"] / m["m00"], w, h))
    if not cands:
        return []

    # Merge duplicates (inner/outer ring contours): keep the largest per centre.
    cands.sort(key=lambda b: -b.w * b.h)
    kept: list[Blob] = []
    cell = max_size  # spatial hash: neighbours can only be in adjacent cells
    grid: dict[tuple[int, int], list[Blob]] = {}
    for b in cands:
        gx, gy = int(b.x // cell), int(b.y // cell)
        near = (k for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k in grid.get((gx + dx, gy + dy), ()))
        if all((b.x - k.x) ** 2 + (b.y - k.y) ** 2 > (0.5 * k.r) ** 2 for k in near):
            kept.append(b)
            grid.setdefault((gx, gy), []).append(b)

    # Keep the dominant size cluster (bubbles are all printed the same size).
    ws = np.array([b.w for b in kept])
    hs = np.array([b.h for b in kept])
    # Mode of rounded sizes is more robust than median when text blobs abound.
    mode_w = Counter(np.round(ws / 2).astype(int)).most_common(1)[0][0] * 2
    mode_h = Counter(np.round(hs / 2).astype(int)).most_common(1)[0][0] * 2
    med_w = float(np.median(ws[np.abs(ws - mode_w) <= 0.3 * mode_w])) if np.any(np.abs(ws - mode_w) <= 0.3 * mode_w) else mode_w
    med_h = float(np.median(hs[np.abs(hs - mode_h) <= 0.3 * mode_h])) if np.any(np.abs(hs - mode_h) <= 0.3 * mode_h) else mode_h
    return [b for b in kept if abs(b.w - med_w) <= 0.28 * med_w and abs(b.h - med_h) <= 0.28 * med_h]


def group_rows(blobs: list[Blob]) -> list[list[Blob]]:
    if not blobs:
        return []
    h = float(np.median([b.h for b in blobs]))
    rows: list[list[Blob]] = []
    for b in sorted(blobs, key=lambda b: b.y):
        if rows and abs(b.y - np.mean([x.y for x in rows[-1]])) < 0.5 * h:
            rows[-1].append(b)
        else:
            rows.append([b])
    return [sorted(r, key=lambda b: b.x) for r in rows]


def split_row(row: list[Blob], spacing: float) -> list[list[Blob]]:
    groups: list[list[Blob]] = [[row[0]]]
    for a, b in zip(row, row[1:]):
        if b.x - a.x > 1.55 * spacing:
            groups.append([b])
        else:
            groups[-1].append(b)
    return groups


def typical_spacing(rows: list[list[Blob]]) -> float:
    d = [b.x - a.x for r in rows for a, b in zip(r, r[1:])]
    if not d:
        return 0.0
    d = np.array(d)
    # The smallest common neighbour distance is the option spacing.
    lo = np.percentile(d, 25)
    return float(np.median(d[d <= lo * 1.3]))


@dataclass
class QuestionGroup:
    blobs: list[Blob]

    @property
    def x(self) -> float:
        return self.blobs[0].x

    @property
    def y(self) -> float:
        return float(np.mean([b.y for b in self.blobs]))


def find_question_groups(blobs: list[Blob], n_options: int | None = None) -> tuple[list[QuestionGroup], int, list[Blob]]:
    """Group bubbles into questions. Returns (groups in reading order, n_options, leftovers)."""
    rows = group_rows(blobs)
    spacing = typical_spacing(rows)
    if spacing <= 0:
        return [], 0, blobs
    groups = [g for r in rows for g in split_row(r, spacing)]
    if n_options is None:
        sizes = Counter(len(g) for g in groups if 2 <= len(g) <= 6)
        if not sizes:
            return [], 0, blobs
        n_options = sizes.most_common(1)[0][0]
    qs = [QuestionGroup(g) for g in groups if len(g) == n_options]
    used = {id(b) for q in qs for b in q.blobs}
    leftovers = [b for b in blobs if id(b) not in used]

    # Column-major ordering: cluster by x of first bubble.
    qs.sort(key=lambda q: q.x)
    cols: list[list[QuestionGroup]] = []
    for q in qs:
        if cols and abs(q.x - np.mean([c.x for c in cols[-1]])) < 1.5 * spacing:
            cols[-1].append(q)
        else:
            cols.append([q])
    ordered = [q for c in cols for q in sorted(c, key=lambda q: q.y)]
    return ordered, n_options, leftovers


def find_digit_columns(blobs: list[Blob], digits: int = 10) -> list[list[Blob]]:
    """Vertical runs of exactly ``digits`` bubbles (index-number grids), left to right."""
    if not blobs:
        return []
    w = float(np.median([b.w for b in blobs]))
    cols: list[list[Blob]] = []
    for b in sorted(blobs, key=lambda b: b.x):
        if cols and abs(b.x - np.mean([x.x for x in cols[-1]])) < 0.5 * w:
            cols[-1].append(b)
        else:
            cols.append([b])
    out = []
    for c in cols:
        c = sorted(c, key=lambda b: b.y)
        if len(c) < digits:
            continue
        # take the most regular run of `digits` consecutive bubbles
        best, best_cv = None, 1e9
        for i in range(len(c) - digits + 1):
            run = c[i : i + digits]
            d = np.diff([b.y for b in run])
            cv = float(np.std(d) / (np.mean(d) + 1e-6))
            if cv < best_cv:
                best, best_cv = run, cv
        if best is not None and best_cv < 0.12:
            out.append(best)
    return out
