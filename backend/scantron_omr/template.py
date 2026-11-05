"""Sheet template model.

A template describes *where* every bubble lives on a sheet, in template pixel
coordinates (origin = top-left of the page / reference image).

Templates are declared as a list of rectangular *blocks*. A block is a grid of
bubbles:

* ``mcq``   - one item per question; options along ``options_axis``
  (``x`` by default: ``1 (A) (B) (C) (D)``).
* ``field`` - one item per character of a bubbled code (index number, course
  code, exam version, ...). Options along ``options_axis`` (``y`` by default:
  0-9 or A-Z stacked vertically). Several blocks may feed the same field, in
  order - e.g. a letters block and a digits block for ``COE 456``.
  ``"type": "id"`` is shorthand for ``field: "index_number"`` with digits.

Optional ``regions`` name rectangles (handwritten name, written index boxes,
signature...) that are cropped from the aligned sheet and returned for review.

The same structure is used for built-in printable sheets and for JSON
templates of third-party sheets (e.g. KNUST answer sheets).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np

AlignmentKind = Literal["aruco", "features", "page", "none"]
BlockKind = Literal["mcq", "field"]

DIGITS = "0123456789"
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
INDEX_FIELD = "index_number"


@dataclass(frozen=True)
class Item:
    """One question (mcq) or one character column of a code field."""

    key: str  # stable identifier, e.g. "q12" or "index_number:3"
    label: str  # human label, e.g. "12" (question) or "4" (character position)
    block: int  # index into Template.blocks
    options: tuple[str, ...]
    centers: np.ndarray  # (n_options, 2) float32, template px

    def shifted(self, dx: float, dy: float) -> "Item":
        return Item(self.key, self.label, self.block, self.options, self.centers + np.float32([dx, dy]))


@dataclass(frozen=True)
class Block:
    kind: BlockKind
    name: str
    bbox: tuple[float, float, float, float]  # x0, y0, x1, y1 (bubble extents)
    option_gap: float
    item_gap: float
    field: str | None = None


@dataclass
class FieldDef:
    name: str  # machine name, e.g. "index_number"
    label: str  # display, e.g. "Index number"
    columns: list[Item]
    allow_trailing_blank: bool = True  # shorter codes leave the last columns empty


@dataclass(frozen=True)
class Region:
    name: str
    label: str
    bbox: tuple[float, float, float, float]


@dataclass
class Alignment:
    kind: AlignmentKind = "page"
    dictionary: str = "DICT_4X4_100"
    # marker id -> 4x2 corners (TL, TR, BR, BL) in template px
    markers: dict[int, np.ndarray] = field(default_factory=dict)
    # "features": grayscale image of the blank sheet at template resolution
    reference: np.ndarray | None = field(default=None, repr=False)


@dataclass
class Template:
    id: str
    name: str
    width: int
    height: int
    bubble_radius: float
    alignment: Alignment
    blocks: list[Block]
    questions: list[Item]
    fields: dict[str, FieldDef]
    regions: list[Region] = field(default_factory=list)
    description: str = ""
    printable: bool = False
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def num_questions(self) -> int:
        return len(self.questions)

    @property
    def options(self) -> tuple[str, ...]:
        return self.questions[0].options if self.questions else ()

    @property
    def id_columns(self) -> list[Item]:
        f = self.fields.get(INDEX_FIELD)
        return f.columns if f else []

    @property
    def field_items(self) -> list[Item]:
        return [it for f in self.fields.values() for it in f.columns]

    @property
    def marker_ids(self) -> set[int]:
        return set(self.alignment.markers)

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "num_questions": self.num_questions,
            "options": list(self.options),
            "id_digits": len(self.id_columns),
            "fields": [
                {"name": f.name, "label": f.label, "length": len(f.columns)} for f in self.fields.values()
            ],
            "regions": [{"name": r.name, "label": r.label} for r in self.regions],
            "alignment": self.alignment.kind,
            "printable": self.printable,
            "page": {"width": self.width, "height": self.height},
        }


# --------------------------------------------------------------------------- #
# Construction from a JSON-style spec
# --------------------------------------------------------------------------- #


def _marker_corners(x: float, y: float, size: float) -> np.ndarray:
    return np.float32([[x, y], [x + size, y], [x + size, y + size], [x, y + size]])


def _alphabet(v: str | None, default: str) -> tuple[str, ...]:
    if v is None:
        return tuple(default)
    named = {"digits": DIGITS, "letters": LETTERS, "alnum": LETTERS + DIGITS}
    return tuple(named.get(v, v))


def template_from_spec(spec: dict[str, Any], base_dir: str | Path | None = None) -> Template:
    """Build a :class:`Template` from a JSON-compatible dict.

    Spec format (all coordinates in template px)::

        {
          "id": "my-sheet", "name": "My sheet",
          "page": {"width": 1240, "height": 1754},
          "bubble_radius": 13,
          "alignment": {"type": "aruco" | "features" | "page" | "none", ...},
          "blocks": [
            {"type": "mcq", "name": "Q1-25", "origin": [120, 640], "first": 1,
             "count": 25, "options": "ABCDE", "option_gap": 36, "item_gap": 38},
            {"type": "id", "origin": [860, 240], "count": 8,
             "option_gap": 34, "item_gap": 40},
            {"type": "field", "field": "course_code", "label": "Course code",
             "origin": [500, 240], "count": 3, "options": "letters",
             "option_gap": 30, "item_gap": 36}
          ],
          "regions": [{"name": "name", "label": "Name", "bbox": [80, 180, 760, 230]}]
        }

    ``origin`` is the centre of the first bubble of the first item.
    ``aruco``    needs ``markers: [{id, x, y, size}, ...]``.
    ``features`` needs ``reference: "reference.png"`` (blank sheet, relative to the JSON).
    """
    page = spec.get("page", {})
    width, height = int(page["width"]), int(page["height"])
    radius = float(spec.get("bubble_radius", 12))

    align_spec = spec.get("alignment", {"type": "page"})
    alignment = Alignment(kind=align_spec.get("type", "page"))
    if alignment.kind == "aruco":
        alignment.dictionary = align_spec.get("dictionary", "DICT_4X4_100")
        for m in align_spec["markers"]:
            alignment.markers[int(m["id"])] = _marker_corners(m["x"], m["y"], m["size"])
        if len(alignment.markers) < 3:
            raise ValueError("aruco alignment needs at least 3 markers")
    elif alignment.kind == "features":
        import cv2

        ref_path = Path(base_dir or ".") / align_spec["reference"]
        ref = cv2.imread(str(ref_path), cv2.IMREAD_GRAYSCALE)
        if ref is None:
            raise ValueError(f"reference image not found: {ref_path}")
        if ref.shape[:2] != (height, width):
            ref = cv2.resize(ref, (width, height), interpolation=cv2.INTER_AREA)
        alignment.reference = ref
    elif alignment.kind not in ("page", "none"):
        raise ValueError(f"unknown alignment type {alignment.kind!r}")

    blocks: list[Block] = []
    questions: list[Item] = []
    fields: dict[str, FieldDef] = {}

    for b_idx, b in enumerate(spec["blocks"]):
        btype = b["type"]
        if btype == "id":
            kind: BlockKind = "field"
            fname, flabel = b.get("field", INDEX_FIELD), b.get("label", "Index number")
            options = _alphabet(b.get("options"), DIGITS)
        elif btype == "field":
            kind = "field"
            fname = b["field"]
            flabel = b.get("label", fname.replace("_", " ").capitalize())
            options = _alphabet(b.get("options"), DIGITS)
        elif btype == "mcq":
            kind, fname, flabel = "mcq", None, None
            options = _alphabet(b.get("options"), "ABCDE")
        else:
            raise ValueError(f"unknown block type {btype!r}")

        count = int(b["count"])
        ox, oy = map(float, b["origin"])
        og, ig = float(b["option_gap"]), float(b["item_gap"])
        axis = b.get("options_axis", "x" if kind == "mcq" else "y")
        if axis not in ("x", "y"):
            raise ValueError("options_axis must be 'x' or 'y'")

        if fname is not None and fname not in fields:
            fields[fname] = FieldDef(fname, flabel or fname, [], bool(b.get("allow_trailing_blank", True)))

        items_here: list[Item] = []
        first = int(b.get("first", 1))
        for i in range(count):
            if axis == "x":
                centers = [(ox + j * og, oy + i * ig) for j in range(len(options))]
            else:
                centers = [(ox + i * ig, oy + j * og) for j in range(len(options))]
            arr = np.float32(centers)
            if kind == "mcq":
                n = first + i
                items_here.append(Item(f"q{n}", str(n), b_idx, options, arr))
            else:
                pos = len(fields[fname].columns) + len(items_here)
                items_here.append(Item(f"{fname}:{pos}", str(pos + 1), b_idx, options, arr))

        allc = np.concatenate([it.centers for it in items_here])
        bbox = (
            float(allc[:, 0].min() - radius),
            float(allc[:, 1].min() - radius),
            float(allc[:, 0].max() + radius),
            float(allc[:, 1].max() + radius),
        )
        blocks.append(Block(kind, b.get("name", flabel or f"block{b_idx}"), bbox, og, ig, fname))
        if kind == "mcq":
            questions.extend(items_here)
        else:
            fields[fname].columns.extend(items_here)

    questions.sort(key=lambda it: int(it.label))
    labels = [q.label for q in questions]
    if len(set(labels)) != len(labels):
        raise ValueError("duplicate question numbers in template")

    regions = [
        Region(r["name"], r.get("label", r["name"]), tuple(map(float, r["bbox"])))  # type: ignore[arg-type]
        for r in spec.get("regions", [])
    ]

    return Template(
        id=spec["id"],
        name=spec.get("name", spec["id"]),
        description=spec.get("description", ""),
        width=width,
        height=height,
        bubble_radius=radius,
        alignment=alignment,
        blocks=blocks,
        questions=questions,
        fields=fields,
        regions=regions,
        printable=bool(spec.get("printable", False)),
        raw=spec,
    )


def load_template_file(path: str | Path) -> Template:
    with open(path, encoding="utf-8") as fh:
        return template_from_spec(json.load(fh), base_dir=Path(path).parent)
