"""Built-in printable sheet layouts and the template registry.

Every built-in sheet carries four ArUco markers in its corners. The marker IDs
encode the template (``ids = 4*code + corner``), so a scanned sheet tells us
which template it is - the user never has to pick the wrong one.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .template import Template, load_template_file, template_from_spec

# A4 portrait at 150 DPI.
PAGE_W, PAGE_H = 1240, 1754
MARKER = 72
MARGIN = 44
RADIUS = 13
OPTION_GAP = 36
ROW_GAP = 38
ID_ROW_GAP = 33
ID_COL_GAP = 40
ANSWERS_TOP = 640
ANSWERS_BOTTOM = PAGE_H - MARGIN - MARKER - 40
MAX_ROWS = 25
LABEL_W = 46  # room for the question number left of the first bubble


def standard_spec(code: int, num_questions: int, options: str = "ABCDE", id_digits: int = 8) -> dict[str, Any]:
    if not 1 <= num_questions <= 100:
        raise ValueError("num_questions must be in 1..100")
    if not 2 <= len(options) <= 6:
        raise ValueError("2..6 options supported")

    m = MARKER
    markers = [
        {"id": 4 * code + 0, "x": MARGIN, "y": MARGIN, "size": m},  # TL
        {"id": 4 * code + 1, "x": PAGE_W - MARGIN - m, "y": MARGIN, "size": m},  # TR
        {"id": 4 * code + 2, "x": PAGE_W - MARGIN - m, "y": PAGE_H - MARGIN - m, "size": m},  # BR
        {"id": 4 * code + 3, "x": MARGIN, "y": PAGE_H - MARGIN - m, "size": m},  # BL
    ]

    blocks: list[dict[str, Any]] = []

    # Student ID block, top right. One column per digit, digits 0-9 downwards.
    id_width = (id_digits - 1) * ID_COL_GAP
    id_x0 = PAGE_W - MARGIN - 40 - id_width - RADIUS
    blocks.append(
        {
            "type": "id",
            "name": "Index number",
            "origin": [id_x0, 236],
            "count": id_digits,
            "options": "0123456789",
            "option_gap": ID_ROW_GAP,
            "item_gap": ID_COL_GAP,
        }
    )

    # Answer columns.
    cols = math.ceil(num_questions / MAX_ROWS)
    rows = math.ceil(num_questions / cols)
    col_w = LABEL_W + (len(options) - 1) * OPTION_GAP + 2 * RADIUS
    usable_w = PAGE_W - 2 * (MARGIN + 30)
    spacing = min(usable_w / cols, col_w + 140)
    total_w = spacing * (cols - 1) + col_w
    x_start = (PAGE_W - total_w) / 2 + LABEL_W + RADIUS
    available_h = ANSWERS_BOTTOM - ANSWERS_TOP
    row_gap = min(ROW_GAP, available_h / max(rows, 1))
    q = 1
    for c in range(cols):
        count = min(rows, num_questions - q + 1)
        if count <= 0:
            break
        blocks.append(
            {
                "type": "mcq",
                "name": f"Q{q}-{q + count - 1}",
                "origin": [round(x_start + c * spacing, 2), ANSWERS_TOP],
                "first": q,
                "count": count,
                "options": options,
                "option_gap": OPTION_GAP,
                "item_gap": row_gap,
            }
        )
        q += count

    opt_tag = "" if options == "ABCDE" else f"-{len(options)}opt"
    return {
        "id": f"std-{num_questions}{opt_tag}",
        "name": f"Standard {num_questions} questions ({options[0]}-{options[-1]})",
        "description": f"A4 printable sheet, {num_questions} questions, {id_digits}-digit index number.",
        "printable": True,
        "page": {"width": PAGE_W, "height": PAGE_H},
        "bubble_radius": RADIUS,
        "alignment": {"type": "aruco", "dictionary": "DICT_4X4_100", "markers": markers},
        "blocks": blocks,
        "regions": [
            {"name": "name", "label": "Name", "bbox": [80, 168, 770, 224]},
            {"name": "course", "label": "Course / Exam", "bbox": [80, 230, 770, 286]},
        ],
    }


# code -> (questions, options). Codes are permanent: they are printed on sheets.
_BUILTIN: dict[int, tuple[int, str]] = {
    0: (20, "ABCDE"),
    1: (40, "ABCDE"),
    2: (60, "ABCDE"),
    3: (100, "ABCDE"),
    4: (50, "ABCD"),
    5: (30, "ABCDE"),
    6: (50, "ABCDE"),
    7: (80, "ABCDE"),
}


class TemplateRegistry:
    def __init__(self) -> None:
        self._templates: dict[str, Template] = {}

    def add(self, t: Template) -> None:
        self._templates[t.id] = t

    def get(self, template_id: str) -> Template:
        try:
            return self._templates[template_id]
        except KeyError as exc:
            raise KeyError(f"unknown template {template_id!r}") from exc

    def all(self) -> list[Template]:
        return list(self._templates.values())

    def by_marker_ids(self, ids: set[int]) -> Template | None:
        """Return the template whose markers best match the detected IDs."""
        best, best_n = None, 0
        for t in self._templates.values():
            if t.alignment.kind != "aruco":
                continue
            n = len(t.marker_ids & ids)
            if n > best_n:
                best, best_n = t, n
        return best if best_n >= 3 else None

    def load_dir(self, path: str | Path) -> None:
        p = Path(path)
        if not p.is_dir():
            return
        for f in sorted([*p.glob("*.json"), *p.glob("*/template.json")]):
            self.add(load_template_file(f))


def default_registry(extra_dir: str | Path | None = None) -> TemplateRegistry:
    reg = TemplateRegistry()
    for code, (n, opts) in sorted(_BUILTIN.items(), key=lambda kv: kv[1]):
        reg.add(template_from_spec(standard_spec(code, n, opts)))
    reg.load_dir(Path(__file__).resolve().parent.parent / "templates")
    if extra_dir:
        reg.load_dir(extra_dir)
    return reg
