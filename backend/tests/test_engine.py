"""End-to-end accuracy tests for the OMR engine.

Synthetic photos cover perspective, rotation, shadows, blur, noise and JPEG
artefacts; real photos (repo ``assets/images``) cover template-free reading.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from scantron_omr import OMREngine, ScanRequest, ScoringPolicy, TemplateRegistry, default_registry, parse_answer_key
from scantron_omr.calibrate import calibrate
from scantron_omr.template import load_template_file

from .synth import SCALE, Marks, PhotoParams, draw_marks, expected_answers, photograph, random_marks, read_answers

ASSETS = Path(__file__).resolve().parents[2] / "assets" / "images"


@pytest.fixture(scope="module")
def registry() -> TemplateRegistry:
    return default_registry()


@pytest.fixture(scope="module")
def engine(registry) -> OMREngine:
    return OMREngine(registry)


def _check(res, marks: Marks):
    exp, got = expected_answers(marks), read_answers(res)
    wrong = {k: (exp[k], got.get(k)) for k in exp if exp[k] != got.get(k)}
    assert not wrong, f"misread questions: {wrong}"
    if marks.student_id:
        assert res["student_id"]["value"] == marks.student_id


@pytest.mark.parametrize(
    "template_id,seed,params",
    [
        ("std-20", 1, PhotoParams()),
        ("std-40", 2, PhotoParams(rotation=8, persp=0.08)),
        ("std-60", 3, PhotoParams(rotation=180, shadow=0.5)),
        ("std-100", 4, PhotoParams(rotation=-6, blur=1.6, noise=6, jpeg=70)),
        ("std-50-4opt", 5, PhotoParams(rotation=90, fill=0.7)),
        ("std-30", 6, PhotoParams(gradient=0.55, shadow=0.55, tint=(0.85, 0.95, 1.0))),
        ("std-80", 7, PhotoParams(fill=0.6, persp=0.1)),
    ],
)
def test_builtin_sheets_detected_and_read_exactly(engine, registry, template_id, seed, params):
    rng = np.random.default_rng(seed)
    t = registry.get(template_id)
    m = random_marks(t, rng, blank_rate=0.04, multi_rate=0.03)
    photo = photograph(draw_marks(t, m, rng), params, rng)
    res = engine.scan(ScanRequest(photo, include_images=False))  # template auto-detected from markers
    assert res["template"]["id"] == template_id
    assert res["alignment"]["method"] == "markers"
    _check(res, m)
    # Only genuinely irregular questions (blank / multiple) may need review.
    irregular = {k for k, v in m.answers.items() if len(v) != 1}
    assert set(res["review"]["questions"]) <= irregular


def test_pen_faint_and_erased_marks(engine, registry):
    rng = np.random.default_rng(11)
    t = registry.get("std-40")
    m = random_marks(t, rng)
    for i, q in enumerate(t.questions[:12]):
        opt = m.answers[q.label][0]
        m.styles[(q.label, opt)] = ["pen", "faint", "full"][i % 3]
    # An erased answer next to the final answer must not count.
    q13 = t.questions[12]
    final = m.answers[q13.label][0]
    erased = next(o for o in q13.options if o != final)
    m.erased.append((q13.label, erased))
    res = engine.scan(ScanRequest(photograph(draw_marks(t, m, rng), PhotoParams(), rng), include_images=False))
    _check(res, m)


def test_partial_mark_is_read_or_flagged(engine, registry):
    rng = np.random.default_rng(12)
    t = registry.get("std-20")
    m = random_marks(t, rng)
    q = t.questions[0]
    m.styles[(q.label, m.answers[q.label][0])] = "partial"
    res = engine.scan(ScanRequest(photograph(draw_marks(t, m, rng), PhotoParams(), rng), include_images=False))
    r = next(x for x in res["questions"] if x["label"] == q.label)
    assert r["marked"] == m.answers[q.label] or r["flags"], r


def test_grading_and_annotation(engine, registry):
    rng = np.random.default_rng(13)
    t = registry.get("std-20")
    m = random_marks(t, rng)
    m.answers["1"], m.answers["2"] = [], ["A", "B"]
    key = ["A"] * 20
    photo = photograph(draw_marks(t, m, rng), PhotoParams(), rng)
    res = engine.scan(ScanRequest(photo, answer_key=key, policy=ScoringPolicy(points_wrong=-0.25)))
    correct = sum(1 for k, v in m.answers.items() if v == ["A"])
    wrong = sum(1 for k, v in m.answers.items() if len(v) == 1 and v != ["A"])
    assert res["counts"]["correct"] == correct
    assert res["counts"]["blank"] == 1 and res["counts"]["multiple"] == 1
    assert res["score"] == pytest.approx(correct - 0.25 * (wrong + 1))
    assert res["max_score"] == 20
    assert res["images"]["annotated"].startswith("data:image/jpeg;base64,")
    assert set(res["images"]["regions"]) == {"name", "course"}


def test_explicit_template_falls_back_to_page_edges_without_markers(engine, registry):
    rng = np.random.default_rng(14)
    t = registry.get("std-20")
    m = random_marks(t, rng)
    page = draw_marks(t, m, rng)
    for c in t.alignment.markers.values():  # hide the markers
        x0, y0 = (c[0] * SCALE).astype(int)
        x1, y1 = (c[2] * SCALE).astype(int)
        page[y0 - 2 : y1 + 2, x0 - 2 : x1 + 2] = 255
    photo = photograph(page, PhotoParams(persp=0.04, shadow=0.2), rng)
    res = engine.scan(ScanRequest(photo, template="std-20", include_images=False))
    assert res["alignment"]["method"] == "page"
    _check(res, m)


def test_calibrated_sheet_with_feature_registration(tmp_path, registry):
    """Simulates an institutional (KNUST-style) sheet: no fiducials, calibrated from one blank."""
    rng = np.random.default_rng(21)
    t = registry.get("std-60")

    def unmarked(page):
        for c in t.alignment.markers.values():
            x0, y0 = (c[0] * SCALE).astype(int)
            x1, y1 = (c[2] * SCALE).astype(int)
            page[y0 - 2 : y1 + 2, x0 - 2 : x1 + 2] = 255
        return page

    blank = photograph(unmarked(draw_marks(t, Marks(), rng)), PhotoParams(persp=0.02, shadow=0.1, blur=0.8), rng)
    spec, sheet, notes = calibrate(blank, "sim-inst", "Simulated institution", "ABCDE", [("index_number", "digits", 8)])
    cv2.imwrite(str(tmp_path / "reference.png"), cv2.cvtColor(sheet, cv2.COLOR_BGR2GRAY))
    (tmp_path / "template.json").write_text(json.dumps(spec))
    kt = load_template_file(tmp_path / "template.json")
    assert kt.num_questions == 60 and len(kt.id_columns) == 8, notes

    reg = TemplateRegistry()
    reg.add(kt)
    eng = OMREngine(reg)
    for rot in (0, 180, -9):
        m = random_marks(t, rng, blank_rate=0.03, multi_rate=0.02)
        photo = photograph(unmarked(draw_marks(t, m, rng)), PhotoParams(rotation=rot, persp=0.07, shadow=0.4), rng)
        res = eng.scan(ScanRequest(photo, template="sim-inst", include_images=False))
        assert res["alignment"]["method"] == "features"
        _check(res, m)


# Known answers of the sample photos in assets/images (classic PyImageSearch set).
REAL = {
    "test_01.png": "BEACB",
    "test_02.png": "AAAAA",
    "test_03.png": "CEABB",
    "test_04.png": "ABCDE",
    "test_05.png": "BEADB",
}


@pytest.mark.parametrize("name,answers", REAL.items())
def test_real_photos_auto_mode(engine, name, answers):
    img = cv2.imread(str(ASSETS / name))
    assert img is not None
    res = engine.scan(ScanRequest(img, template="auto", answer_key="BEADB", include_images=False))
    assert res["template"]["num_questions"] == 5
    assert "".join(q["marked"][0] if q["marked"] else "-" for q in res["questions"]) == answers


def test_parse_answer_key_formats():
    opts = tuple("ABCDE")
    assert parse_answer_key("BEA", opts) == {"1": ["B"], "2": ["E"], "3": ["A"]}
    assert parse_answer_key(["B", "AC", None], opts) == {"1": ["B"], "2": ["A", "C"], "3": []}
    assert parse_answer_key({"10": "d", "2": ["e"]}, opts) == {"10": ["D"], "2": ["E"]}
    assert parse_answer_key([1, 4], opts) == {"1": ["B"], "2": ["E"]}
    with pytest.raises(ValueError):
        parse_answer_key("BZ", opts)


def test_no_sheet_in_photo(engine):
    noise = (np.random.default_rng(0).random((900, 700, 3)) * 255).astype(np.uint8)
    from scantron_omr import TemplateNotDetectedError

    with pytest.raises(TemplateNotDetectedError):
        engine.scan(ScanRequest(noise))
