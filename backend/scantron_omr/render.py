"""Render a printable answer sheet (PNG/PDF) from a template.

The drawing uses exactly the template geometry, so a printed sheet always
matches what the reader expects.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .template import Template

INK = (35, 35, 35)
RING = (70, 70, 70)
SOFT = (150, 150, 150)
ACCENT = (20, 20, 20)


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "arialbd.ttf" if bold else "arial.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def aruco_dictionary(name: str):
    return cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, name))


def render_sheet(t: Template, scale: float = 2.0, title: str | None = None) -> Image.Image:
    """Render the sheet at ``scale`` x template resolution (2.0 => 300 DPI A4)."""
    W, H = int(t.width * scale), int(t.height * scale)
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    s = scale

    def S(v: float) -> float:
        return v * s

    # Markers
    if t.alignment.kind == "aruco":
        dic = aruco_dictionary(t.alignment.dictionary)
        for mid, corners in t.alignment.markers.items():
            x0, y0 = corners[0]
            size = int(round(S(corners[1][0] - corners[0][0])))
            m = cv2.aruco.generateImageMarker(dic, mid, size, borderBits=1)
            img.paste(Image.fromarray(m).convert("RGB"), (int(round(S(x0))), int(round(S(y0)))))

    # Layout options from the spec ("print"); defaults are the standard sheets.
    cfg = (t.raw or {}).get("print", {})
    rx, ry = S(t.rx), S(t.ry)
    cell = abs(t.rx - t.ry) > 0.5  # narrow "<A>"-style option cells instead of round bubbles

    # Header
    f_title, f_lbl, f_small = _font(int(S(30)), True), _font(int(S(17))), _font(int(S(13)))
    f_opt = _font(int(S(min(12, t.ry * 1.5))), True)
    d.text((S(140), S(52)), title or "ANSWER SHEET", font=f_title, fill=ACCENT)
    d.text((S(140), S(92)), f"{t.name}  ·  sheet {t.id}", font=f_small, fill=SOFT)

    lx0 = S(90)
    lines = cfg.get("lines") or [[lbl, 90, 205 + i * 62, 760] for i, lbl in enumerate(["Name", "Course / Exam", "Date", "Signature"])]
    for lbl, x0, y, x1 in lines:
        d.text((S(x0), S(y) - S(26)), lbl, font=f_lbl, fill=INK)
        d.line([(S(x0), S(y) + S(8)), (S(x1), S(y) + S(8))], fill=SOFT, width=max(1, int(S(1.2))))

    instr = (
        "• Use a dark pencil or black/blue pen.   • Fill the bubble completely.\n"
        "• Erase cleanly to change an answer.   • Do not mark the corner squares."
    )
    show_instructions = "instructions" not in cfg
    if show_instructions:
        d.multiline_text((lx0, S(470)), instr, font=f_small, fill=INK, spacing=int(S(6)))

    # Example of a correct mark
    ex_y = S(545)
    if not show_instructions:
        ex_y = -S(1000)  # off-page: no example row on this layout
    d.text((lx0, ex_y - S(9)), "Correct mark:", font=f_small, fill=INK)
    r = S(t.bubble_radius)
    cx = lx0 + S(125)
    d.ellipse([cx - r, ex_y - r, cx + r, ex_y + r], fill=(40, 40, 40))
    d.text((lx0 + S(160), ex_y - S(9)), "Wrong:", font=f_small, fill=INK)
    for k, kind in enumerate(["tick", "cross", "dot"]):
        cx = lx0 + S(230 + k * 40)
        d.ellipse([cx - r, ex_y - r, cx + r, ex_y + r], outline=RING, width=max(1, int(S(1.5))))
        if kind == "tick":
            d.line([(cx - r * 0.5, ex_y), (cx - r * 0.1, ex_y + r * 0.45), (cx + r * 0.55, ex_y - r * 0.5)], fill=INK, width=int(S(2)))
        elif kind == "cross":
            d.line([(cx - r * 0.5, ex_y - r * 0.5), (cx + r * 0.5, ex_y + r * 0.5)], fill=INK, width=int(S(2)))
            d.line([(cx - r * 0.5, ex_y + r * 0.5), (cx + r * 0.5, ex_y - r * 0.5)], fill=INK, width=int(S(2)))
        else:
            d.ellipse([cx - r * 0.25, ex_y - r * 0.25, cx + r * 0.25, ex_y + r * 0.25], fill=INK)

    ring_w = max(1, int(round(S(1.2 if cell else 1.5))))

    def bubble(cx: float, cy: float, label: str) -> None:
        x, y = S(cx), S(cy)
        if cell:
            d.rounded_rectangle([x - rx, y - ry, x + rx, y + ry], radius=ry * 0.9, outline=RING, width=ring_w)
        else:
            d.ellipse([x - r, y - r, x + r, y + r], outline=RING, width=ring_w)
        d.text((x, y), label, font=f_opt, fill=SOFT, anchor="mm")

    # Code fields (index number, course code...): write-in boxes on top + bubbles
    for f in t.fields.values():
        cols = f.columns
        for col in cols:
            for (cx, cy), opt in zip(col.centers, col.options):
                bubble(cx, cy, opt)
        first = cols[0].centers[0]
        top = min(c.centers[:, 1].min() for c in cols) - t.ry
        bottom = max(c.centers[:, 1].max() for c in cols) + t.ry
        left = min(c.centers[:, 0].min() for c in cols) - t.rx
        right = max(c.centers[:, 0].max() for c in cols) + t.rx
        d.text((S(first[0] - t.rx), S(top - 72)), f.label.upper(), font=f_lbl, fill=INK)
        for col in cols:
            cx = col.centers[0][0]
            d.rectangle([S(cx - 16), S(top - 44), S(cx + 16), S(top - 8)], outline=SOFT, width=max(1, int(S(1))))
        frame = [S(left - 11), S(top - 52), S(right + 11), S(bottom + 9)]
        d.rounded_rectangle(frame, radius=S(8), outline=SOFT, width=max(1, int(S(1))))

    # Questions
    f_q = _font(int(S(12 if cell else 15)), True)
    for q in t.questions:
        x0, y0 = q.centers[0]
        d.text((S(x0 - t.rx - 8), S(y0)), q.label, font=f_q, fill=INK, anchor="rm")
        for (cx, cy), opt in zip(q.centers, q.options):
            bubble(cx, cy, opt)
    # Light guide lines every 5 questions
    for b in t.blocks:
        if b.kind != "mcq":
            continue
        qs = [q for q in t.questions if q.block == t.blocks.index(b)]
        for i, q in enumerate(qs):
            if i and i % 5 == 0:
                y = (q.centers[0][1] + qs[i - 1].centers[0][1]) / 2
                d.line([(S(b.bbox[0] - 40), S(y)), (S(b.bbox[2] + 6), S(y))], fill=(215, 215, 215), width=1)

    # Boxes around each answer group (university layout)
    if cfg.get("group_boxes"):
        for b in t.blocks:
            if b.kind != "mcq":
                continue
            x0, y0, x1, y1 = b.bbox
            d.rounded_rectangle([S(x0 - 44), S(y0 - 5), S(x1 + 8), S(y1 + 5)], radius=S(5), outline=SOFT, width=max(1, int(S(1))))

    footer = cfg.get("footer", "Do not fold · Keep the four corner markers visible when scanning")
    d.text((W / 2, H - S(62)), footer, font=f_small, fill=SOFT, anchor="mm")
    return img


def sheet_bytes(t: Template, fmt: str = "pdf", title: str | None = None) -> bytes:
    img = render_sheet(t, title=title)
    buf = io.BytesIO()
    if fmt == "pdf":
        img.save(buf, format="PDF", resolution=300.0)
    else:
        img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_template_debug(t: Template) -> np.ndarray:
    """Template-resolution BGR rendering, used by tests."""
    img = render_sheet(t, scale=1.0)
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
