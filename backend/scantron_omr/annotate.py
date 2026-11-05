"""Draw the reading on the aligned sheet for human verification."""

from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

from .reader import ItemReading

GREEN = (70, 175, 40)
RED = (60, 50, 225)
ORANGE = (0, 150, 255)
BLUE = (215, 120, 30)
YELLOW = (0, 210, 255)
GRAY = (150, 150, 150)


def annotate(
    sheet: np.ndarray,
    questions: list[ItemReading],
    id_cols: list[ItemReading],
    graded: dict[str, Any] | None,
    radius: float,
    header: str | None = None,
) -> np.ndarray:
    img = sheet.copy()
    r = int(round(radius)) + 2
    results = {q["label"]: q for q in graded["questions"]} if graded else {}

    for q in questions:
        res = results.get(q.label)
        key = set(res["key"]) if res else set()
        for i, (cx, cy) in enumerate(q.centers):
            c = (int(round(cx)), int(round(cy)))
            opt = q.options[i]
            is_marked = opt in q.marked
            if is_marked:
                if not res or res["result"] == "ungraded":
                    color = BLUE
                elif res["result"] == "correct":
                    color = GREEN
                elif res["result"] == "multiple":
                    color = ORANGE
                else:
                    color = RED
                cv2.circle(img, c, r, color, 3, cv2.LINE_AA)
            elif opt in key:
                # Correct answer the student did not pick.
                cv2.circle(img, c, r, GREEN, 2, cv2.LINE_AA)
        if q.needs_review:
            x0 = int(q.centers[:, 0].min()) - r - 6
            x1 = int(q.centers[:, 0].max()) + r + 6
            y = int(q.centers[0, 1])
            cv2.rectangle(img, (x0, y - r - 4), (x1, y + r + 4), YELLOW, 2, cv2.LINE_AA)

    for col in id_cols:
        for i, (cx, cy) in enumerate(col.centers):
            if col.options[i] in col.marked:
                cv2.circle(img, (int(round(cx)), int(round(cy))), r, BLUE, 3, cv2.LINE_AA)
        if col.needs_review or col.status != "answered":
            xs, ys = col.centers[:, 0], col.centers[:, 1]
            cv2.rectangle(
                img,
                (int(xs.min()) - r - 3, int(ys.min()) - r - 3),
                (int(xs.max()) + r + 3, int(ys.max()) + r + 3),
                YELLOW,
                2,
            )

    if header:
        h = 46
        band = img[:h].copy()
        cv2.rectangle(band, (0, 0), (img.shape[1], h), (30, 30, 30), -1)
        img[:h] = cv2.addWeighted(band, 0.85, img[:h], 0.15, 0)
        cv2.putText(img, header, (16, 31), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    return img


def to_data_url(img: np.ndarray, quality: int = 82, max_side: int = 1600) -> str:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")
