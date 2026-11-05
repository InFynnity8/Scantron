from __future__ import annotations

import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from server import main
from scantron_omr import default_registry

from .synth import PhotoParams, draw_marks, photograph, random_marks


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(main.app)


def _jpeg(img) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes()


def test_health_and_templates(client):
    assert client.get("/health").json()["status"] == "ok"
    ts = client.get("/v1/templates").json()["templates"]
    ids = {t["id"] for t in ts}
    assert {"std-20", "std-60", "std-100"} <= ids
    t = client.get("/v1/templates/std-60").json()
    assert t["num_questions"] == 60 and t["id_digits"] == 8
    assert client.get("/v1/templates/nope").status_code == 404


def test_printable_sheet(client):
    r = client.get("/v1/templates/std-20/sheet?format=pdf")
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    r = client.get("/v1/templates/std-20/sheet?format=png")
    assert r.headers["content-type"] == "image/png"


def test_scan_end_to_end(client):
    rng = np.random.default_rng(5)
    t = default_registry().get("std-40")
    m = random_marks(t, rng)
    photo = photograph(draw_marks(t, m, rng), PhotoParams(rotation=5), rng)
    key = "".join(m.answers[q.label][0] for q in t.questions)
    key = "A" + key[1:] if key[0] != "A" else "B" + key[1:]  # make exactly one wrong
    r = client.post(
        "/v1/scan",
        files={"image": ("sheet.jpg", _jpeg(photo), "image/jpeg")},
        data={"answer_key": key, "include_images": "false"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["template"]["id"] == "std-40"
    assert body["student_id"]["value"] == m.student_id
    assert body["score"] == 39 and body["max_score"] == 40
    assert "images" not in body


def test_scan_errors(client):
    r = client.post("/v1/scan", files={"image": ("x.jpg", b"not an image", "image/jpeg")})
    assert r.status_code == 400 and r.json()["error"] == "bad_image"
    blank = np.full((800, 600, 3), 30, np.uint8)
    r = client.post("/v1/scan", files={"image": ("x.jpg", _jpeg(blank), "image/jpeg")})
    assert r.status_code == 422 and r.json()["error"] == "template_not_detected"
    r = client.post(
        "/v1/scan", files={"image": ("x.jpg", _jpeg(blank), "image/jpeg")}, data={"template": "missing"}
    )
    assert r.status_code == 404


def test_jwt_enforced_when_configured(client, monkeypatch):
    import jwt

    monkeypatch.setattr(main, "JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    blank = np.full((300, 300, 3), 200, np.uint8)
    r = client.post("/v1/scan", files={"image": ("x.jpg", _jpeg(blank), "image/jpeg")})
    assert r.status_code == 401
    token = jwt.encode({"id": "u1", "exp": int(time.time()) + 60}, "test-secret-that-is-at-least-32-bytes-long", algorithm="HS256")
    r = client.post(
        "/v1/scan",
        files={"image": ("x.jpg", _jpeg(blank), "image/jpeg")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422  # authorised; the image just has no sheet
