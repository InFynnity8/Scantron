"""A synthetic KNUST-style answer sheet for testing (NOT the official layout).

Mimics the features that matter for OMR: pink/red drop-out print, "<A>"
bracket options filled as pencil dashes, 200 questions in 5 columns x 40
(groups of 5), a 7-digit candidate number grid with alternating bands and a
black timing track on the right edge. No fiducial markers.
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from scantron_omr.template import template_from_spec

W, H = 1240, 1754
PINK = (222, 92, 140)  # RGB
PINK_LIGHT = (246, 205, 220)
OPT_W, OPT_H = 30, 15
COL_X = [118, 336, 554, 772, 990]
OPT_GAP = 36
ROW_GAP = 17.6
GROUP_GAP = 12
Q_TOP = 905
ID_X, ID_Y, ID_COLS, ID_COL_GAP, ID_ROW_GAP = 128, 330, 7, 34, 26


def _font(size: int, bold: bool = False):
    for n in (["DejaVuSans-Bold.ttf", "arialbd.ttf"] if bold else ["DejaVuSans.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def spec() -> dict:
    blocks = []
    for c, x in enumerate(COL_X):
        for g in range(8):
            first = c * 40 + g * 5 + 1
            y = Q_TOP + g * (5 * ROW_GAP + GROUP_GAP)
            blocks.append(
                {
                    "type": "mcq",
                    "name": f"Q{first}-{first + 4}",
                    "origin": [x, round(y, 2)],
                    "first": first,
                    "count": 5,
                    "options": "ABCDE",
                    "option_gap": OPT_GAP,
                    "item_gap": ROW_GAP,
                }
            )
    blocks.append(
        {"type": "id", "label": "Candidate number", "origin": [ID_X, ID_Y], "count": ID_COLS, "option_gap": ID_ROW_GAP, "item_gap": ID_COL_GAP}
    )
    return {
        "id": "knust-sim",
        "name": "KNUST-style simulation (200)",
        "page": {"width": W, "height": H},
        "bubble_radius": OPT_W / 2,
        "bubble_size": [OPT_W, OPT_H],
        "ink_channel": "red",
        "alignment": {"type": "features", "reference": "reference.png"},
        "blocks": blocks,
        "regions": [{"name": "name", "label": "Name", "bbox": [700, 140, 1150, 200]}],
    }


def render(scale: float = 2.0) -> np.ndarray:
    """Blank sheet, BGR, at `scale` x template resolution."""
    S = lambda v: v * scale  # noqa: E731
    img = Image.new("RGB", (int(W * scale), int(H * scale)), "white")
    d = ImageDraw.Draw(img)
    f_t, f_s, f_o = _font(int(S(22)), True), _font(int(S(13)), True), _font(int(S(10)), True)
    d.text((S(W / 2), S(70)), "KWAME NKRUMAH UNIVERSITY OF SCIENCE & TECHNOLOGY, KUMASI", font=f_t, fill=(20, 20, 20), anchor="mm")
    d.text((S(W / 2), S(105)), "MULTIPLE CHOICE ANSWER SHEET", font=f_s, fill=PINK, anchor="mm")
    d.rectangle([S(90), S(140), S(620), S(170)], fill=PINK)
    d.text((S(100), S(146)), "Use HB pencil only to complete this form and mark like this", font=f_o, fill="white")
    # Candidate number grid with alternating bands
    d.rectangle([S(ID_X - 24), S(ID_Y - 60), S(ID_X + ID_COL_GAP * (ID_COLS - 1) + 24), S(ID_Y - 36)], fill=PINK)
    d.text((S(ID_X - 18), S(ID_Y - 56)), "CANDIDATE NUMBER", font=f_o, fill="white")
    for c in range(ID_COLS):
        x = ID_X + c * ID_COL_GAP
        if c % 2 == 0:
            d.rectangle([S(x - 17), S(ID_Y - 16), S(x + 17), S(ID_Y + 9 * ID_ROW_GAP + 14)], fill=PINK_LIGHT)
        d.rectangle([S(x - 14), S(ID_Y - 34), S(x + 14), S(ID_Y - 18)], outline=PINK, width=2)
        for v in range(10):
            d.text((S(x), S(ID_Y + v * ID_ROW_GAP)), f"‹{v}›", font=f_o, fill=PINK, anchor="mm")
    # Other header boxes (not read, but realistic texture for registration)
    for i, (lbl, x) in enumerate([("ACADEMIC YEAR", 420), ("COURSE CODE", 640), ("SEMESTER", 980)]):
        d.rectangle([S(x), S(300), S(x + 180), S(324)], fill=PINK)
        d.text((S(x + 8), S(304)), lbl, font=f_o, fill="white")
        d.rectangle([S(x), S(324), S(x + 180), S(560 + 40 * i)], outline=PINK, width=3)
    # Answer area
    d.rectangle([S(90), S(Q_TOP - 40), S(1170), S(H - 110)], outline=PINK, width=4)
    for c, x in enumerate(COL_X):
        d.rectangle([S(x - 52), S(Q_TOP - 26), S(x + 4 * OPT_GAP + 24), S(Q_TOP + 8 * (5 * ROW_GAP + GROUP_GAP))], outline=PINK, width=2)
        for g in range(8):
            for r in range(5):
                q = c * 40 + g * 5 + r + 1
                y = Q_TOP + g * (5 * ROW_GAP + GROUP_GAP) + r * ROW_GAP
                d.text((S(x - 28), S(y)), str(q), font=f_o, fill=(30, 30, 30), anchor="rm")
                for j, o in enumerate("ABCDE"):
                    d.text((S(x + j * OPT_GAP), S(y)), f"‹{o}›", font=f_o, fill=PINK, anchor="mm")
    # Timing track
    for k in range(60):
        y = 300 + k * 23
        d.rectangle([S(1190), S(y), S(1214), S(y + 8)], fill=(15, 15, 15))
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def template(reference_dir) -> "object":
    """Write reference.png and return the compiled template."""
    from pathlib import Path

    ref = cv2.cvtColor(cv2.resize(render(1.0), (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    cv2.imwrite(str(Path(reference_dir) / "reference.png"), ref)
    return template_from_spec(spec(), base_dir=reference_dir)


def draw_dash(img: np.ndarray, cx: float, cy: float, rng, scale: float = 2.0, style: str = "full") -> None:
    """HB-pencil dash over an option (render px)."""
    w, h = OPT_W * scale * rng.uniform(0.75, 0.95), OPT_H * scale * rng.uniform(0.6, 0.85)
    cx += rng.normal(0, 1.2 * scale)
    cy += rng.normal(0, 0.8 * scale)
    level = {"full": rng.uniform(45, 95), "faint": rng.uniform(115, 140)}[style]
    pad = int(max(w, h))
    x0, y0 = int(cx) - pad, int(cy) - pad
    roi = img[y0 : y0 + 2 * pad, x0 : x0 + 2 * pad]
    mask = np.zeros(roi.shape[:2], np.uint8)
    cv2.ellipse(mask, (pad, pad), (int(w / 2), int(h / 2)), rng.uniform(-4, 4), 0, 360, 255, -1, cv2.LINE_AA)
    tex = np.clip(level + rng.normal(0, 16, mask.shape), 0, 255).astype(np.float32)
    a = (cv2.GaussianBlur(mask, (0, 0), 0.8).astype(np.float32) / 255.0)[..., None]
    roi[:] = (roi * (1 - a) + np.minimum(roi, tex[..., None]) * a).astype(np.uint8)


def filled(t, answers: dict[str, list[str]], student_id: str, rng, scale: float = 2.0, styles=None) -> np.ndarray:
    page = render(scale)
    for q in t.questions:
        for o in answers.get(q.label, []):
            c = q.centers[q.options.index(o)] * scale
            draw_dash(page, c[0], c[1], rng, scale, (styles or {}).get((q.label, o), "full"))
    for col, dgt in zip(t.id_columns, student_id):
        c = col.centers[col.options.index(dgt)] * scale
        draw_dash(page, c[0], c[1], rng, scale)
    return page
