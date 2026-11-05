"""Build a template for a third-party sheet (e.g. KNUST) from ONE blank sheet.

Usage::

    python -m scantron_omr.calibrate blank_knust.jpg --out templates/knust-60 \\
        --id knust-60 --name "KNUST 60 questions" --options ABCDE \\
        --field index_number:digits:7 --field course_code:letters:3

What it does

1. Finds the paper in the photo (or uses the full image with ``--no-crop`` for
   flatbed scans) and flattens it to template resolution.
2. Saves that blank as ``reference.png`` - scans are later registered against it
   with SIFT feature matching (no fiducials needed, robust to rotation,
   perspective and partial occlusion).
3. Discovers every bubble, groups them into questions (rows of N options) and
   code-field columns (vertical runs of 10 digits / 26 letters).
4. Writes ``template.json`` and ``preview.png`` (detected layout drawn on the
   blank) so you can verify it. The JSON is plain and easy to hand-edit
   (question numbering, extra fields, regions for handwritten boxes).

Best input: a flat, evenly lit, sharp photo or a 200-300 DPI scan of a BLANK sheet.
For sheets whose options are not round bubbles (e.g. KNUST "<A>" brackets), pass
``--mask`` with an image of the same sheet where every option cell is painted
white on black; the cells are then taken from the mask.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from .align import find_page_quad
from .discover import Blob, find_bubbles, find_digit_columns, find_question_groups
from .template import DIGITS, LETTERS, template_from_spec

ALPHABETS = {"digits": DIGITS, "letters": LETTERS}


def _runs(values: list[float], tol: float = 0.12) -> list[tuple[int, int]]:
    """Split a sorted coordinate list into runs of near-uniform spacing."""
    if len(values) < 2:
        return [(0, len(values))]
    runs, start = [], 0
    gaps = np.diff(values)
    ref = gaps[0]
    for i, g in enumerate(gaps, start=1):
        if abs(g - ref) > tol * ref:
            runs.append((start, i))
            start = i
            ref = gaps[i] if i < len(gaps) else ref
    runs.append((start, len(values)))
    return runs


def _mcq_blocks(groups, options: str, order: str) -> list[dict]:
    # Columns of questions (by x of first bubble).
    sp = float(np.median([b.x - a.x for g in groups for a, b in zip(g.blobs, g.blobs[1:])]))
    cols: list[list] = []
    for g in sorted(groups, key=lambda g: g.x):
        if cols and abs(g.x - np.mean([c.x for c in cols[-1]])) < 1.5 * sp:
            cols[-1].append(g)
        else:
            cols.append([g])
    cols = [sorted(c, key=lambda g: g.y) for c in cols]

    if order == "row":
        # number across columns first: row r of every column, then r+1...
        max_rows = max(len(c) for c in cols)
        numbering: dict[int, int] = {}
        n = 1
        for r in range(max_rows):
            for c in cols:
                if r < len(c):
                    numbering[id(c[r])] = n
                    n += 1
    else:
        numbering = {}
        n = 1
        for c in cols:
            for g in c:
                numbering[id(g)] = n
                n += 1

    blocks = []
    for c in cols:
        ys = [g.y for g in c]
        for a, b in _runs(ys):
            run = c[a:b]
            nums = [numbering[id(g)] for g in run]
            consecutive = all(y - x == 1 for x, y in zip(nums, nums[1:]))
            chunks = [run] if consecutive else [[g] for g in run]
            for ch in chunks:
                og = float(np.mean([np.mean(np.diff([bb.x for bb in g.blobs])) for g in ch]))
                ig = float(np.mean(np.diff([g.y for g in ch]))) if len(ch) > 1 else 40.0
                first = ch[0]
                blocks.append(
                    {
                        "type": "mcq",
                        "name": f"Q{numbering[id(first)]}-{numbering[id(ch[-1])]}",
                        "origin": [round(first.blobs[0].x, 2), round(first.y, 2)],
                        "first": numbering[id(first)],
                        "count": len(ch),
                        "options": options,
                        "option_gap": round(og, 3),
                        "item_gap": round(ig, 3),
                    }
                )
    return blocks


def _field_blocks(name: str, label: str, alphabet: str, cols: list[list[Blob]]) -> list[dict]:
    xs = [c[0].x for c in cols]
    blocks = []
    for a, b in _runs(xs):
        run = cols[a:b]
        og = float(np.mean([np.mean(np.diff([bb.y for bb in c])) for c in run]))
        ig = float(np.mean(np.diff([c[0].x for c in run]))) if len(run) > 1 else 40.0
        blocks.append(
            {
                "type": "field",
                "field": name,
                "label": label,
                "origin": [round(run[0][0].x, 2), round(run[0][0].y, 2)],
                "count": len(run),
                "options": alphabet,
                "option_gap": round(og, 3),
                "item_gap": round(ig, 3),
            }
        )
    return blocks


def blobs_from_mask(mask: np.ndarray) -> list[Blob]:
    """Option cells from a hand-made mask (white cells on black), e.g. drawn in Photoshop."""
    g = mask if mask.ndim == 2 else cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(g, 127, 255, cv2.THRESH_BINARY)
    n, _, stats, cents = cv2.connectedComponentsWithStats(bw, connectivity=8)
    blobs = [Blob(float(cents[i][0]), float(cents[i][1]), float(stats[i][2]), float(stats[i][3])) for i in range(1, n) if stats[i][4] >= 12]
    if not blobs:
        return []
    mw = float(np.median([b.w for b in blobs]))
    mh = float(np.median([b.h for b in blobs]))
    # Drop big region masks (e.g. a whole answer area) - keep cell-sized components.
    return [b for b in blobs if 0.5 * mw <= b.w <= 1.8 * mw and 0.5 * mh <= b.h <= 1.8 * mh]


def detect_ink_channel(sheet: np.ndarray) -> str:
    """'red' if the print is red/pink drop-out ink (it vanishes in the red channel)."""
    b, g, r = (sheet[:, :, i].astype(np.float32) for i in range(3))
    printed = (g < 200) & (np.abs(r - g) > 5)
    if printed.mean() < 0.002:
        return "gray"
    redness = float(np.median((r - g)[printed]))
    return "red" if redness > 45 else "gray"


def calibrate(
    image: np.ndarray,
    template_id: str,
    name: str,
    options: str = "ABCDE",
    fields: list[tuple[str, str, int]] | None = None,
    order: str = "column",
    width: int = 1240,
    crop: bool = True,
    mask: np.ndarray | None = None,
    ink: str = "auto",
) -> tuple[dict, np.ndarray, list[str]]:
    notes: list[str] = []
    if crop:
        quad = find_page_quad(image)
        if quad is None:
            notes.append("Paper edges not found: using the whole image (fine for flatbed scans).")
    else:
        quad = None
    if quad is None:
        h, w = image.shape[:2]
        quad = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    wd = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
    ht = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
    height = int(round(width * ht / wd))
    dst = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
    H = cv2.getPerspectiveTransform(np.float32(quad), dst)
    sheet = cv2.warpPerspective(image, H, (width, height), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    gray = cv2.cvtColor(sheet, cv2.COLOR_BGR2GRAY)

    if mask is not None:
        if mask.shape[:2] != image.shape[:2]:
            mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)
        warped_mask = cv2.warpPerspective(mask, H, (width, height), flags=cv2.INTER_NEAREST)
        blobs = blobs_from_mask(warped_mask)
        notes.append(f"Using {len(blobs)} option cells from the mask.")
    else:
        blobs = find_bubbles(gray)
    if not blobs:
        raise ValueError("No bubbles found on the blank sheet.")
    radius = float(np.median([b.r for b in blobs]))
    cell_w = float(np.median([b.w for b in blobs]))
    cell_h = float(np.median([b.h for b in blobs]))
    elongated = max(cell_w, cell_h) / max(1.0, min(cell_w, cell_h)) > 1.3
    ink_channel = detect_ink_channel(sheet) if ink == "auto" else ink
    notes.append(f"Ink channel: {ink_channel}" + (" (red drop-out print detected)" if ink_channel == "red" else ""))
    groups, n_opt, leftovers = find_question_groups(blobs, len(options))
    notes.append(f"Found {len(blobs)} bubbles (radius ~{radius:.1f}px), {len(groups)} questions of {n_opt} options.")
    blocks = _mcq_blocks(groups, options, order) if groups else []

    for fname, alphabet_key, length in fields or []:
        alphabet = ALPHABETS.get(alphabet_key, alphabet_key)
        cols = find_digit_columns(leftovers, len(alphabet))
        cols.sort(key=lambda c: c[0].x)
        if len(cols) < length:
            notes.append(f"Field {fname}: expected {length} columns of {len(alphabet)}, found {len(cols)}.")
        take = cols[:length]
        if take:
            used = {id(b) for c in take for b in c}
            leftovers = [b for b in leftovers if id(b) not in used]
            label = "Index number" if fname == "index_number" else fname.replace("_", " ").capitalize()
            blocks += _field_blocks(fname, label, alphabet, take)
            notes.append(f"Field {fname}: {len(take)} columns.")
    if leftovers:
        notes.append(f"{len(leftovers)} bubble(s) not assigned to any question or field.")

    spec = {
        "id": template_id,
        "name": name,
        "description": f"Calibrated from a blank sheet ({len(groups)} questions).",
        "page": {"width": width, "height": height},
        "bubble_radius": round(radius * 0.92, 2),
        **({"bubble_size": [round(cell_w * 0.9, 1), round(cell_h * 0.9, 1)]} if elongated else {}),
        "ink_channel": ink_channel,
        "alignment": {"type": "features", "reference": "reference.png"},
        "blocks": blocks,
        "regions": [],
    }
    return spec, sheet, notes


def preview(spec: dict, sheet: np.ndarray) -> np.ndarray:
    t = template_from_spec({**spec, "alignment": {"type": "none"}})
    img = sheet.copy()
    r = int(round(t.bubble_radius))
    axes = (int(round(t.rx)), int(round(t.ry)))
    for q in t.questions:
        for cx, cy in q.centers:
            cv2.ellipse(img, (int(cx), int(cy)), axes, 0, 0, 360, (40, 170, 40), 2)
        x0, y0 = q.centers[0]
        cv2.putText(img, q.label, (int(x0) - 3 * r - 18, int(y0) + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 220), 1)
    for f in t.fields.values():
        for col in f.columns:
            for cx, cy in col.centers:
                cv2.ellipse(img, (int(cx), int(cy)), axes, 0, 0, 360, (210, 120, 30), 2)
    return img


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", help="photo or scan of a BLANK sheet")
    ap.add_argument("--out", required=True, help="output folder, e.g. templates/knust-60")
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--options", default="ABCDE")
    ap.add_argument(
        "--field",
        action="append",
        default=[],
        help="name:alphabet:length, alphabet = digits|letters|<chars>. e.g. index_number:digits:7",
    )
    ap.add_argument("--order", choices=["column", "row"], default="column", help="question numbering direction")
    ap.add_argument("--width", type=int, default=1240)
    ap.add_argument("--no-crop", action="store_true", help="image is already cropped to the sheet (scanner)")
    ap.add_argument("--mask", help="mask image aligned with IMAGE: option cells white on black (e.g. made in Photoshop)")
    ap.add_argument("--ink", choices=["auto", "gray", "red"], default="auto", help="channel used to read marks")
    a = ap.parse_args(argv)

    img = cv2.imread(a.image, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {a.image}")
    fields = []
    for f in a.field:
        n, alpha, ln = f.split(":")
        fields.append((n, alpha, int(ln)))
    mask = cv2.imread(a.mask, cv2.IMREAD_GRAYSCALE) if a.mask else None
    if a.mask and mask is None:
        raise SystemExit(f"cannot read {a.mask}")
    spec, sheet, notes = calibrate(img, a.id, a.name, a.options, fields, a.order, a.width, not a.no_crop, mask, a.ink)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out / "reference.png"), cv2.cvtColor(sheet, cv2.COLOR_BGR2GRAY))
    (out / "template.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
    cv2.imwrite(str(out / "preview.png"), preview(spec, sheet))
    for n in notes:
        print("-", n)
    print(f"Wrote {out / 'template.json'}, reference.png and preview.png - check preview.png before use.")


if __name__ == "__main__":
    main()
