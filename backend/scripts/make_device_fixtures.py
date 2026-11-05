"""Synthetic phone photos (JPEG) + ground truth for the on-device TypeScript engine test.

    python backend/scripts/make_device_fixtures.py OUT_DIR [--count 24] [--width 760] [--seed 21]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scantron_omr import default_registry  # noqa: E402
from tests.synth import PhotoParams, draw_marks, photograph, random_marks  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--count", type=int, default=24)
    ap.add_argument("--width", type=int, default=760)
    ap.add_argument("--seed", type=int, default=21)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    templates = [t for t in default_registry().all() if t.printable]
    cases = []
    for i in range(a.count):
        t = templates[i % len(templates)]
        m = random_marks(t, rng, blank_rate=0.03, multi_rate=0.02)
        for q in t.questions:
            for o in m.answers[q.label]:
                m.styles[(q.label, o)] = str(rng.choice(["full", "full", "pen", "faint"]))
        p = PhotoParams(
            rotation=float(rng.choice([0, 0, 90, 180, -90]) + rng.uniform(-12, 12)),
            persp=float(rng.uniform(0, 0.09)),
            fill=float(rng.uniform(0.6, 0.92)),
            shadow=float(rng.uniform(0, 0.6)),
            gradient=float(rng.uniform(0, 0.5)),
            blur=float(rng.uniform(0.5, 2.0)),
            noise=float(rng.uniform(2, 8)),
            jpeg=int(rng.integers(60, 95)),
        )
        photo = photograph(draw_marks(t, m, rng), p, rng)
        h = int(photo.shape[0] * a.width / photo.shape[1])
        small = cv2.resize(photo, (a.width, h), interpolation=cv2.INTER_AREA)
        name = out / f"case{i:03d}.jpg"
        cv2.imwrite(str(name), small, [cv2.IMWRITE_JPEG_QUALITY, 70])
        cases.append({"file": name.name, "template": t.id, "answers": {k: sorted(v) for k, v in m.answers.items()}, "id": m.student_id})
    (out / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
    print(f"wrote {len(cases)} fixtures to {out}")


if __name__ == "__main__":
    main()
