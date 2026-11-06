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
    ap.add_argument("--knust-sim", action="store_true", help="marker-free KNUST-style sheets (registration path)")
    ap.add_argument("--knust-idl", action="store_true", help="the real KNUST IDL template (templates/knust-idl-200)")
    a = ap.parse_args()
    if a.knust_sim:
        return knust(a)
    if a.knust_idl:
        return knust_idl(a)
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
        # The app uses a larger live frame for sheets with small option cells (200 questions).
        width = max(a.width, 1080) if min(t.rx, t.ry) < 8 else a.width
        h = int(photo.shape[0] * width / photo.shape[1])
        small = cv2.resize(photo, (width, h), interpolation=cv2.INTER_AREA)
        name = out / f"case{i:03d}.jpg"
        cv2.imwrite(str(name), small, [cv2.IMWRITE_JPEG_QUALITY, 70])
        cases.append({"file": name.name, "template": t.id, "answers": {k: sorted(v) for k, v in m.answers.items()}, "id": m.student_id})
    (out / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
    print(f"wrote {len(cases)} fixtures to {out}")


def knust(a) -> None:
    from tests import knust_sim as K

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    t = K.template(out)  # writes reference.png
    ref = cv2.imread(str(out / "reference.png"), cv2.IMREAD_GRAYSCALE)
    cv2.imwrite(str(out / "reference.jpg"), ref, [cv2.IMWRITE_JPEG_QUALITY, 90])
    (out / "template.json").write_text(json.dumps(K.spec()), encoding="utf-8")
    cases = []
    for i in range(a.count):
        answers = {q.label: [str(rng.choice(list("ABCDE")))] for q in t.questions}
        for q in rng.choice(len(t.questions), 6, replace=False):
            answers[str(q + 1)] = []
        sid = "".join(str(rng.integers(0, 10)) for _ in range(7))
        page = K.filled(t, answers, sid, rng)
        p = PhotoParams(
            rotation=float(rng.choice([0, 0, 180]) + rng.uniform(-8, 8)),
            persp=float(rng.uniform(0.0, 0.06)),
            fill=float(rng.uniform(0.75, 0.9)),
            shadow=float(rng.uniform(0, 0.5)),
            gradient=float(rng.uniform(0, 0.4)),
            blur=float(rng.uniform(0.5, 1.4)),
            noise=float(rng.uniform(2, 6)),
            jpeg=int(rng.integers(70, 95)),
            background=(int(rng.integers(30, 90)),) * 3,
        )
        photo = photograph(page, p, rng)
        h = int(photo.shape[0] * a.width / photo.shape[1])
        name = out / f"knust{i:03d}.jpg"
        cv2.imwrite(str(name), cv2.resize(photo, (a.width, h), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 80])
        cases.append({"file": name.name, "template": t.id, "answers": answers, "id": sid})
    (out / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
    print(f"wrote {len(cases)} KNUST-style fixtures to {out}")


def knust_idl(a) -> None:
    from tests import knust_idl as KI

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    t = default_registry().get(KI.TEMPLATE_ID)
    ref = cv2.cvtColor(KI.reference_bgr(), cv2.COLOR_BGR2GRAY)
    cv2.imwrite(str(out / "reference.jpg"), ref, [cv2.IMWRITE_JPEG_QUALITY, 90])  # what /reference.jpg serves
    (out / "template.json").write_text((KI.TEMPLATE_DIR / "template.json").read_text(encoding="utf-8"), encoding="utf-8")
    cases = []
    for i in range(a.count):
        f = KI.random_sheet(t, rng)
        wood = bool(i % 2)
        p = PhotoParams(
            rotation=float(rng.choice([0, 0, 180]) + rng.uniform(-6, 6)),
            persp=float(rng.uniform(0.0, 0.05)),
            fill=float(rng.uniform(0.75, 0.9)),
            shadow=float(rng.uniform(0, 0.5)),
            gradient=float(rng.uniform(0, 0.4)),
            blur=float(rng.uniform(0.5, 1.4)),
            noise=float(rng.uniform(2, 6)),
            jpeg=int(rng.integers(70, 95)),
            background=(int(rng.integers(50, 80)), int(rng.integers(95, 125)), int(rng.integers(140, 175)))
            if wood
            else (int(rng.integers(30, 90)),) * 3,
        )
        photo = photograph(KI.render(f, rng), p, rng)
        h = int(photo.shape[0] * a.width / photo.shape[1])
        name = out / f"idl{i:03d}.jpg"
        cv2.imwrite(str(name), cv2.resize(photo, (a.width, h), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])
        cases.append({"file": name.name, "template": t.id, "answers": f.answers, "id": f.fields["index_number"], "fields": KI.expected_fields(f)})
    (out / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
    print(f"wrote {len(cases)} KNUST IDL fixtures to {out}")


if __name__ == "__main__":
    main()
