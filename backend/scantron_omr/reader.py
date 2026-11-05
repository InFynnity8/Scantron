"""Bubble fill measurement and mark decisions.

Decisions are *adaptive*: thresholds are derived from the sheet itself rather
than fixed constants, so pencil vs. pen, lighting and paper tone don't matter.

* ``baseline`` - typical ink level of an empty bubble on this sheet (median;
  most bubbles on any sheet are empty).
* ``floor``    - nothing below ``baseline + MIN_MARK_DELTA`` is ever a mark.
* ``global``   - largest jump in the sorted fill values above the baseline
  (separates "empty" from "filled" clusters for the whole sheet).
* per item     - if the item's own values show a clear jump, that local
  threshold is used (handles faint-but-deliberate marks next to heavy ones).

Each decision carries a confidence in [0,1] and review flags.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import cv2
import numpy as np

from .template import Item

MIN_MARK_DELTA = 0.16  # fill above baseline required to count as a mark
MIN_JUMP = 0.14  # minimum gap to treat as a filled/empty separation
DEFAULT_DELTA = 0.32  # threshold above baseline when the sheet has no clear jump
CONF_SCALE = 0.14  # distance from threshold that gives full confidence
REVIEW_CONFIDENCE = 0.45
MARK_LEVEL_RATIO = 0.45  # sheet threshold must sit below this fraction of a typical mark
POSSIBLE_MARK_GAP = 0.09  # blank item whose darkest cell stands out this much is sent for review
FAINT_DELTA = 0.10  # code columns: a lone, clearly darker cell this far above baseline is a faint mark

Status = Literal["answered", "blank", "multiple"]


@dataclass
class ItemReading:
    key: str
    label: str
    options: tuple[str, ...]
    fills: list[float]
    marked: list[str]
    status: Status
    confidence: float
    threshold: float
    flags: list[str] = field(default_factory=list)
    centers: np.ndarray | None = None

    @property
    def needs_review(self) -> bool:
        return bool(self.flags)

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "marked": self.marked,
            "status": self.status,
            "confidence": round(self.confidence, 3),
            "fills": [round(f, 3) for f in self.fills],
            "flags": self.flags,
        }


def _ellipse_offsets(rx: float, ry: float) -> tuple[np.ndarray, np.ndarray]:
    ax, ay = int(np.ceil(rx)), int(np.ceil(ry))
    yy, xx = np.mgrid[-ay : ay + 1, -ax : ax + 1]
    m = (xx / max(rx, 0.5)) ** 2 + (yy / max(ry, 0.5)) ** 2 <= 1.0
    return yy[m], xx[m]


def measure_fills(dark: np.ndarray, items: list[Item], radius: float, ry: float | None = None) -> list[list[float]]:
    """Fill score per bubble, in [0, 1].

    Uses the inner disk only (excludes the printed ring) and blends the mean ink
    with a low percentile. Printed letters inside bubbles cover a minority of
    the disk, so the percentile ignores them, while a real mark covers most of
    it. A light blur first closes the gaps in hatched pencil strokes.
    """
    rx, ry_ = radius, (ry if ry else radius)
    oy, ox = _ellipse_offsets(rx * 0.7, ry_ * 0.7)
    sigma = max(0.6, min(rx, ry_) * 0.08)
    smooth = cv2.GaussianBlur(dark, (0, 0), sigma)
    H, W = dark.shape
    out: list[list[float]] = []
    for it in items:
        vals = []
        for cx, cy in it.centers:
            ys = np.clip(np.round(cy).astype(int) + oy, 0, H - 1)
            xs = np.clip(np.round(cx).astype(int) + ox, 0, W - 1)
            v = smooth[ys, xs]
            p35, p95 = np.percentile(v, [35, 95])
            mean = float(v[v <= p95].mean())  # trim specks
            vals.append(0.5 * mean + 0.5 * float(p35))
        out.append(vals)
    return out


@dataclass
class SheetStats:
    baseline: float
    floor: float
    global_threshold: float
    jump: float

    def as_dict(self) -> dict:
        return {k: round(v, 3) for k, v in self.__dict__.items()}


def sheet_statistics(all_fills: np.ndarray) -> SheetStats:
    """Sheet-level empty/filled separation.

    The threshold sits in the *lowest* clear gap above the empty-bubble
    baseline, so pencil and pen marks on the same sheet are both "filled".
    """
    v = np.sort(np.asarray(all_fills, np.float32))
    baseline = float(np.median(v)) if len(v) else 0.0
    floor = baseline + MIN_MARK_DELTA
    thr, jump = baseline + DEFAULT_DELTA, 0.0
    above = v[v >= floor]
    # A gap only counts if what lies above it looks like a real mark, not a
    # lone erasure smudge: at least MARK_LEVEL_RATIO of the typical mark.
    min_upper = max(floor, MARK_LEVEL_RATIO * float(np.median(above))) if len(above) else floor
    for i in range(len(v) - 1):
        g = float(v[i + 1] - v[i])
        if v[i + 1] >= min_upper and g >= MIN_JUMP:
            thr, jump = float((v[i] + v[i + 1]) / 2), g
            break
    else:
        # No single clean gap (low-contrast print such as "<A>" cells, light
        # pencil): split empty/filled by Otsu, if the two classes are distinct.
        split = _otsu_split(v)
        if split is not None:
            thr = split
    return SheetStats(baseline, floor, max(thr, floor), jump)


def _otsu_split(v: np.ndarray) -> float | None:
    """Two-class split of sorted fills maximising between-class variance."""
    n = len(v)
    if n < 4:
        return None
    c = np.cumsum(v, dtype=np.float64)
    k = np.arange(1, n)
    m0 = c[:-1] / k
    m1 = (c[-1] - c[:-1]) / (n - k)
    score = k * (n - k) * (m1 - m0) ** 2
    i = int(np.argmax(score))
    if m1[i] - m0[i] < MIN_JUMP * 1.5:
        return None
    return float((v[i] + v[i + 1]) / 2)


def decide(
    item: Item, fills: list[float], stats: SheetStats, single_choice: bool = True, code_column: bool = False
) -> ItemReading:
    """Read one item. ``code_column`` (index number, course code...) also accepts a
    single faint but clearly darker cell, flagged "faint" so it is reviewed."""
    f = np.asarray(fills, np.float32)
    thr = stats.global_threshold
    floor = stats.floor
    faint = False
    if not np.any(f >= thr):
        # No clear mark by sheet standards: look for a faint but deliberate one.
        order = np.sort(f)
        gaps = np.diff(order)
        if len(gaps):
            k = int(np.argmax(gaps))
            if gaps[k] >= MIN_JUMP and order[k + 1] >= stats.floor:
                thr = float((order[k] + order[k + 1]) / 2)
            elif (
                code_column
                and k == len(gaps) - 1
                and gaps[k] >= MIN_JUMP
                and order[k + 1] >= stats.baseline + FAINT_DELTA
            ):
                thr = float((order[k] + order[k + 1]) / 2)
                floor = stats.baseline + FAINT_DELTA
                faint = True
    thr = max(thr, floor)

    marked_idx = [i for i, v in enumerate(f) if v >= thr]
    marked = [item.options[i] for i in marked_idx]
    status: Status = "blank" if not marked else ("answered" if len(marked) == 1 else "multiple")

    margin = float(np.min(np.abs(f - thr))) if len(f) else 1.0
    confidence = float(np.clip(margin / CONF_SCALE, 0.0, 1.0))
    flags: list[str] = []
    if confidence < REVIEW_CONFIDENCE:
        flags.append("ambiguous")
    unmarked_inky = [i for i, v in enumerate(f) if v < thr and v >= stats.floor]
    if unmarked_inky:
        flags.append("possible_erasure")
    if status == "multiple" and single_choice:
        flags.append("multiple_marks")
    if faint and status == "answered":
        flags.append("faint")
    if status == "blank" and len(f) > 1:
        top = np.sort(f)
        # Read as blank, but one cell stands out: a light or off-centre mark. Review it.
        if top[-1] - top[-2] >= POSSIBLE_MARK_GAP and top[-1] >= stats.baseline + FAINT_DELTA:
            flags.append("possible_mark")

    return ItemReading(
        item.key, item.label, item.options, [float(x) for x in f], marked, status, confidence, thr, flags, item.centers
    )


def read_items(
    dark: np.ndarray,
    items: list[Item],
    radius: float,
    stats: SheetStats | None = None,
    ry: float | None = None,
    n_questions: int | None = None,
):
    """Read items. Items after the first ``n_questions`` are code columns."""
    fills = measure_fills(dark, items, radius, ry)
    if stats is None:
        stats = sheet_statistics(np.concatenate([np.asarray(x) for x in fills]) if fills else np.zeros(1))
    nq = len(items) if n_questions is None else n_questions
    return [decide(it, fv, stats, code_column=i >= nq) for i, (it, fv) in enumerate(zip(items, fills))], stats, fills


def compose_code(
    columns: list[ItemReading], allow_trailing_blank: bool = True, optional: list[bool] | None = None
) -> tuple[str | None, float, list[str]]:
    """Compose a bubbled code (index number, course code...) from its columns.

    Unreadable characters become ``?``. Trailing blank columns are dropped when
    allowed (shorter codes on a longer grid). Clean blank columns marked in
    ``optional`` are skipped wherever they are.
    """
    if not columns:
        return None, 0.0, []
    n = len(columns)
    if allow_trailing_blank:
        while n > 0 and columns[n - 1].status == "blank" and not columns[n - 1].flags:
            n -= 1
    used = columns[:n]
    if optional and any(optional):
        used = [c for i, c in enumerate(used) if not (i < len(optional) and optional[i] and c.status == "blank" and not c.flags)]
    chars, issues = [], []
    for c in used:
        if c.status == "answered":
            chars.append(c.marked[0])
        else:
            chars.append("?")
            issues.append(f"position {c.label}: {'no mark' if c.status == 'blank' else 'several marks'}")
    for c in used:
        if c.status == "answered" and c.flags:
            issues.append(f"position {c.label}: unclear mark")
    value = "".join(chars) or None
    conf = float(min(c.confidence for c in used)) if used else 0.0
    if value is None or "?" in value:
        conf = min(conf, 0.3)
    return value, conf, issues
