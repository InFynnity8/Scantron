"""Scantron OMR HTTP API.

Run locally::

    uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import time
from functools import lru_cache
from typing import Any

import cv2
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

import scantron_omr
from scantron_omr import AUTO, DETECT, OMREngine, ScanRequest, ScoringPolicy, TemplateNotDetectedError, default_registry
from scantron_omr.align import SheetNotFoundError
from scantron_omr.imageops import ImageDecodeError, decode_image
from scantron_omr.render import sheet_bytes

log = logging.getLogger("scantron")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")

MAX_UPLOAD_MB = float(os.getenv("SCANTRON_MAX_UPLOAD_MB", "15"))
JWT_SECRET = os.getenv("SCANTRON_JWT_SECRET") or None  # same secret as the auth service
cv2.setNumThreads(int(os.getenv("SCANTRON_CV_THREADS", "2")))


@lru_cache(maxsize=1)
def engine() -> OMREngine:
    return OMREngine(default_registry(os.getenv("SCANTRON_TEMPLATES_DIR")))


app = FastAPI(
    title="Scantron OMR API",
    version=scantron_omr.__version__,
    description="Optical mark recognition and grading for multiple-choice answer sheets.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("SCANTRON_CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})


def require_auth(authorization: str | None = Header(default=None)) -> dict[str, Any] | None:
    """Validate the JWT issued by the auth service when SCANTRON_JWT_SECRET is set."""
    if not JWT_SECRET:
        return None
    import jwt

    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "Sign in to scan sheets.")
    try:
        return jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.") from None
    except jwt.InvalidTokenError:
        raise ApiError(401, "unauthorized", "Invalid session. Please sign in again.") from None


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "scantron-omr", "version": scantron_omr.__version__, "docs": "/docs"}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "templates": len(engine().registry.all())}


@app.get("/v1/templates")
def list_templates() -> dict[str, Any]:
    return {"templates": [t.summary() for t in engine().registry.all()]}


def _template(template_id: str):
    try:
        return engine().registry.get(template_id)
    except KeyError:
        raise ApiError(404, "unknown_template", f"No template named '{template_id}'.") from None


@app.get("/v1/templates/{template_id}")
def get_template(template_id: str) -> dict[str, Any]:
    t = _template(template_id)
    return {**t.summary(), "spec": t.raw}


@app.get("/v1/templates/{template_id}/sheet")
def printable_sheet(
    template_id: str,
    format: str = Query("pdf", pattern="^(pdf|png)$"),
    title: str | None = Query(None, max_length=60),
) -> Response:
    t = _template(template_id)
    if not t.printable:
        raise ApiError(400, "not_printable", "This template describes an external sheet and cannot be printed.")
    data = sheet_bytes(t, format, title)
    media = "application/pdf" if format == "pdf" else "image/png"
    return Response(
        data,
        media_type=media,
        headers={"Content-Disposition": f'inline; filename="{t.id}.{format}"', "Cache-Control": "public, max-age=86400"},
    )


@app.get("/v1/templates/{template_id}/reference.jpg")
def template_reference(template_id: str) -> Response:
    """Blank-sheet reference (grayscale JPEG, template resolution) so phones can
    register marker-free sheets such as KNUST offline."""
    t = _template(template_id)
    ref = t.alignment.reference
    if ref is None:
        raise ApiError(404, "no_reference", "This template has no reference image.")
    ok, buf = cv2.imencode(".jpg", ref, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise ApiError(500, "encode_failed", "Could not encode the reference image.")
    return Response(buf.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


def _json_field(raw: str | None, name: str) -> Any:
    if raw is None or raw.strip() == "":
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        if name == "answer_key":
            return raw.strip()  # compact form "BEADB"
        raise ApiError(400, "invalid_json", f"'{name}' must be valid JSON.") from None


@app.post("/v1/scan")
def scan(
    image: UploadFile = File(..., description="Photo or scan of the answer sheet (JPEG/PNG)"),
    template: str = Form(DETECT, description="Template id, 'detect' (read from corner markers) or 'auto'"),
    answer_key: str | None = Form(None, description='JSON list/object or compact string, e.g. ["B","E"] or "BE"'),
    scoring: str | None = Form(None, description='JSON, e.g. {"points_wrong": -0.25}'),
    include_images: bool = Form(True),
    _user: Any = Depends(require_auth),
) -> dict[str, Any]:
    started = time.perf_counter()
    data = image.file.read(int(MAX_UPLOAD_MB * 1024 * 1024) + 1)
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ApiError(413, "too_large", f"Image is larger than {MAX_UPLOAD_MB:g} MB.")
    if not data:
        raise ApiError(400, "empty_image", "No image received.")
    try:
        img = decode_image(data)
    except ImageDecodeError as e:
        raise ApiError(400, "bad_image", str(e)) from None

    if template not in (DETECT, AUTO):
        _template(template)
    key = _json_field(answer_key, "answer_key")
    policy = ScoringPolicy.from_dict(_json_field(scoring, "scoring"))

    try:
        result = engine().scan(ScanRequest(img, template, key, policy, include_images))
    except TemplateNotDetectedError as e:
        raise ApiError(422, "template_not_detected", str(e)) from None
    except SheetNotFoundError as e:
        raise ApiError(422, "sheet_not_found", str(e)) from None
    except ValueError as e:
        raise ApiError(400, "invalid_request", str(e)) from None

    log.info(
        "scan template=%s method=%s score=%s review=%s %.0fms",
        result["template"]["id"],
        result["alignment"]["method"],
        result["score"],
        result["review"]["needed"],
        (time.perf_counter() - started) * 1000,
    )
    return result


@app.exception_handler(HTTPException)
async def _http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": "http_error", "message": str(exc.detail)})
