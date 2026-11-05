"""Filled copies of the real KNUST IDL answer sheet (templates/knust-idl-200) for tests.

Pencil dashes are drawn on the blank reference image at the template's option
positions, then "photographed" (perspective, lighting, blur, JPEG).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from . import knust_sim as K

TEMPLATE_ID = "knust-idl-200"
TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / TEMPLATE_ID
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
SCALE = 2.0  # render at 2x template resolution
DASH = 0.8  # dash size relative to knust_sim's 30x15 cells (template cells are ~24x12)


@dataclass
class Filled:
    answers: dict[str, list[str]]
    fields: dict[str, str | None]
    marks: list[tuple[float, float]] = field(default_factory=list)  # template px


def reference_bgr() -> np.ndarray:
    return cv2.imread(str(TEMPLATE_DIR / "reference.jpg"), cv2.IMREAD_COLOR)


def random_sheet(t, rng: np.random.Generator, n_blank: int = 8) -> Filled:
    answers = {q.label: [str(rng.choice(list("ABCDE")))] for q in t.questions}
    for q in rng.choice(len(t.questions), n_blank, replace=False):
        answers[str(q + 1)] = []
    letters = "".join(rng.choice(list(LETTERS), int(rng.integers(2, 6))))
    digits = "".join(str(rng.integers(0, 10)) for _ in range(3))
    fields = {
        "index_number": "".join(str(rng.integers(0, 10)) for _ in range(7)),
        "course_code": letters + digits,
        "_course_letters": letters,
        "academic_year": str(rng.choice(["2024/25", "2025/26", "2026/27", "2027/28"])),
        "year_of_student": str(rng.integers(1, 8)),
        "semester": str(rng.integers(1, 3)),
    }
    f = Filled(answers, fields)
    for q in t.questions:
        for o in answers[q.label]:
            f.marks.append(tuple(q.centers[q.options.index(o)]))
    cols = t.fields
    for col, d in zip(cols["index_number"].columns, fields["index_number"]):
        f.marks.append(tuple(col.centers[col.options.index(d)]))
    cc = cols["course_code"].columns
    for col, ch in zip(cc[:5], letters):
        f.marks.append(tuple(col.centers[col.options.index(ch)]))
    for col, ch in zip(cc[5:], digits):
        f.marks.append(tuple(col.centers[col.options.index(ch)]))
    for name in ("academic_year", "year_of_student", "semester"):
        col = cols[name].columns[0]
        f.marks.append(tuple(col.centers[col.options.index(fields[name])]))
    return f


def render(f: Filled, rng: np.random.Generator) -> np.ndarray:
    page = cv2.resize(reference_bgr(), None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    for x, y in f.marks:
        K.draw_dash(page, x * SCALE, y * SCALE, rng, SCALE * DASH)
    return page


def expected_fields(f: Filled) -> dict[str, str | None]:
    return {k: v for k, v in f.fields.items() if not k.startswith("_")}
