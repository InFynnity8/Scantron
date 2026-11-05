"""Randomised accuracy benchmark on synthetic phone photos.

    python scripts/benchmark.py --sheets 60 --seed 0
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scantron_omr import OMREngine, ScanRequest, default_registry  # noqa: E402
from tests.synth import PhotoParams, draw_marks, photograph, random_marks  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", type=int, default=40)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    reg = default_registry()
    eng = OMREngine(reg)
    printable = [t for t in reg.all() if t.printable]
    n_q = n_err = n_id = n_id_err = n_review_ok = n_flagged = 0
    times = []
    for i in range(a.sheets):
        t = printable[i % len(printable)]
        m = random_marks(t, rng, blank_rate=0.03, multi_rate=0.02)
        for q in t.questions:  # mix pencil / pen / faint marks
            for o in m.answers[q.label]:
                m.styles[(q.label, o)] = str(rng.choice(["full", "full", "pen", "faint"]))
        p = PhotoParams(
            rotation=float(rng.choice([0, 0, 90, 180, -90]) + rng.uniform(-12, 12)),
            persp=float(rng.uniform(0.0, 0.09)),
            fill=float(rng.uniform(0.6, 0.92)),
            shadow=float(rng.uniform(0, 0.6)),
            gradient=float(rng.uniform(0, 0.5)),
            blur=float(rng.uniform(0.5, 2.0)),
            noise=float(rng.uniform(2, 8)),
            jpeg=int(rng.integers(60, 95)),
        )
        photo = photograph(draw_marks(t, m, rng), p, rng)
        t0 = time.perf_counter()
        try:
            res = eng.scan(ScanRequest(photo, include_images=False))
        except Exception as e:  # noqa: BLE001
            print(f"[{i}] {t.id} FAILED: {e}")
            n_q += len(t.questions)
            n_err += len(t.questions)
            continue
        times.append(time.perf_counter() - t0)
        got = {q["label"]: sorted(q["marked"]) for q in res["questions"]}
        flagged = set(res["review"]["questions"])
        errs = [k for k, v in m.answers.items() if sorted(v) != got.get(k)]
        n_q += len(t.questions)
        n_err += len(errs)
        unflagged_errs = [k for k in errs if k not in flagged]
        n_flagged += len(flagged)
        n_review_ok += len(errs) - len(unflagged_errs)
        n_id += 1
        n_id_err += res["student_id"]["value"] != m.student_id
        print(f"[{i}] {t.id:12s} errors={errs} silent={unflagged_errs} id_ok={res['student_id']['value'] == m.student_id} {times[-1]*1000:.0f}ms")
    print("\n=== summary ===")
    print(f"sheets {a.sheets}, questions {n_q}")
    print(f"question accuracy {100 * (1 - n_err / n_q):.3f}%  ({n_err} errors, {n_review_ok} of them flagged for review)")
    print(f"index number accuracy {100 * (1 - n_id_err / max(n_id, 1)):.2f}%")
    print(f"review flags raised {n_flagged} ({100 * n_flagged / n_q:.2f}% of questions)")
    print(f"median scan time {1000 * float(np.median(times)):.0f} ms")


if __name__ == "__main__":
    main()
