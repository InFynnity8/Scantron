"""End-to-end scan pipeline: image -> aligned sheet -> readings -> grade."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from . import align as A
from .annotate import annotate, to_data_url
from .discover import find_bubbles, find_question_groups
from .grading import ScoringPolicy, grade, parse_answer_key
from .imageops import assess_quality, darkness_map, to_gray
from .layouts import TemplateRegistry
from .reader import ItemReading, compose_code, read_items
from .template import INDEX_FIELD, Item, Template


class TemplateNotDetectedError(ValueError):
    pass


AUTO = "auto"
DETECT = "detect"


@dataclass
class ScanRequest:
    image: np.ndarray
    template: str | None = None  # template id, "detect" (default) or "auto"
    answer_key: Any = None
    policy: ScoringPolicy | None = None
    include_images: bool = True


class OMREngine:
    def __init__(self, registry: TemplateRegistry):
        self.registry = registry

    # ------------------------------------------------------------------ #
    def resolve_template(self, img: np.ndarray, template: str | None) -> tuple[Template, A.MarkerDetection | None]:
        if template and template not in (DETECT, AUTO):
            t = self.registry.get(template)
            det = A.detect_markers(img, t.alignment.dictionary) if t.alignment.kind == "aruco" else None
            return t, det
        det = A.detect_markers(img)
        t = self.registry.by_marker_ids(set(det.ids))
        if t is None:
            raise TemplateNotDetectedError(
                "Could not identify the sheet. Make sure all four corner markers are visible, "
                "or choose the sheet template explicitly."
            )
        return t, det

    def align(self, img: np.ndarray, t: Template, det: A.MarkerDetection | None) -> tuple[A.Aligned, list[str]]:
        warnings: list[str] = []
        aligned = None
        kind = t.alignment.kind
        if kind == "aruco":
            if det is None:
                det = A.detect_markers(img, t.alignment.dictionary)
            aligned = A.align_with_markers(img, t, det)
            if aligned is None:
                warnings.append("Corner markers not found - aligned using the paper edges instead.")
        elif kind == "features":
            aligned = A.align_with_features(img, t)
            if aligned is None:
                warnings.append("Sheet print not recognised - aligned using the paper edges instead.")
        if aligned is None and kind != "none":
            aligned = A.align_with_page(img, t)
        if aligned is None:
            if kind in ("aruco", "features"):
                raise A.SheetNotFoundError(
                    "Answer sheet not found in the photo. Fit the whole sheet in the frame on a contrasting surface."
                )
            aligned = A.align_whole_image(img, t)
            if kind == "page":
                warnings.append("Paper edges not found - assuming the photo is cropped to the sheet.")
        return aligned, warnings

    # ------------------------------------------------------------------ #
    def scan(self, req: ScanRequest) -> dict[str, Any]:
        t0 = time.perf_counter()
        img = req.image
        if req.template == AUTO:
            return self._scan_auto(req, t0)

        t, det = self.resolve_template(img, req.template)
        aligned, warnings = self.align(img, t, det)
        t_align = time.perf_counter()

        dark = darkness_map(aligned.gray, t.bubble_radius)
        r = t.bubble_radius
        min_gap = min(min(b.option_gap, b.item_gap) for b in t.blocks)
        max_shift = {"markers": 0.5 * r, "features": 0.9 * r, "page": 1.6 * r, "none": 2.0 * r}[aligned.method]
        max_shift = min(max_shift, 0.42 * min_gap)
        items, shifts = A.refine_blocks(dark, t, t.questions + t.field_items, max_shift)
        nq = len(t.questions)
        readings, stats, _ = read_items(dark, items, r)
        q_read = readings[:nq]

        # Split field readings back per field (order preserved).
        fields: dict[str, tuple[str, bool, list[ItemReading]]] = {}
        k = nq
        for f in t.fields.values():
            fields[f.name] = (f.label, f.allow_trailing_blank, readings[k : k + len(f.columns)])
            k += len(f.columns)

        crops = {}
        if req.include_images and t.regions:
            for reg in t.regions:
                x0, y0, x1, y1 = (int(round(v)) for v in reg.bbox)
                crop = aligned.image[max(0, y0) : y1, max(0, x0) : x1]
                if crop.size:
                    crops[reg.name] = {"label": reg.label, "image": to_data_url(crop, quality=80, max_side=900)}
        return self._finish(
            req, t.summary(), aligned, q_read, fields, stats, r, warnings, shifts, t0, t_align, crops
        )

    # ------------------------------------------------------------------ #
    def _scan_auto(self, req: ScanRequest, t0: float) -> dict[str, Any]:
        img = req.image
        quad = A.find_page_quad(img)
        warnings: list[str] = []
        if quad is None:
            h, w = img.shape[:2]
            quad = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
            warnings.append("Paper edges not found - using the whole photo.")
        wd = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
        ht = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
        W = 1100
        Hh = int(round(W * ht / max(wd, 1)))
        dst = np.float32([[0, 0], [W, 0], [W, Hh], [0, Hh]])
        H = cv2.getPerspectiveTransform(quad, dst)
        sheet = cv2.warpPerspective(img, H, (W, Hh), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
        gray = to_gray(sheet)
        aligned = A.Aligned(sheet, gray, "page", H, quad, {})
        t_align = time.perf_counter()

        blobs = find_bubbles(gray)
        groups, n_opt, _ = find_question_groups(blobs)
        if not groups:
            raise A.SheetNotFoundError("No answer bubbles found. Try a sharper, closer photo of the sheet.")
        r = float(np.median([b.r for g in groups for b in g.blobs]))
        letters = tuple("ABCDEF"[:n_opt])
        items = [
            Item(f"q{i + 1}", str(i + 1), 0, letters, np.float32([[b.x, b.y] for b in g.blobs]))
            for i, g in enumerate(groups)
        ]
        dark = darkness_map(gray, r)
        readings, stats, _ = read_items(dark, items, r)
        summary = {
            "id": AUTO,
            "name": "Auto-detected layout",
            "description": "Bubbles discovered without a template.",
            "num_questions": len(items),
            "options": list(letters),
            "id_digits": 0,
            "alignment": "page",
            "printable": False,
            "page": {"width": W, "height": Hh},
        }
        return self._finish(req, summary, aligned, readings, {}, stats, r, warnings, {}, t0, t_align, {})

    # ------------------------------------------------------------------ #
    def _finish(self, req, summary, aligned, q_read, fields, stats, r, warnings, shifts, t0, t_align, crops):
        options = tuple(summary["options"])
        key = parse_answer_key(req.answer_key, options) if req.answer_key not in (None, "", [], {}) else {}
        graded = grade(q_read, key, req.policy or ScoringPolicy()) if key else None

        field_out: dict[str, Any] = {}
        all_field_cols: list[ItemReading] = []
        review_reasons: list[str] = []
        for name, (label, trailing, cols) in fields.items():
            value, conf, issues = compose_code(cols, trailing)
            field_out[name] = {
                "label": label,
                "value": value,
                "confidence": round(conf, 3),
                "issues": issues,
                "characters": [c.as_dict() for c in cols],
            }
            all_field_cols.extend(cols)
            if value is None or "?" in value or issues or conf < 0.45:
                review_reasons.append(f"{label} could not be read with confidence")

        quality = assess_quality(aligned.gray)
        warnings = warnings + quality.warnings

        review_q = [q.label for q in q_read if q.needs_review]
        if review_q:
            review_reasons.insert(0, f"{len(review_q)} question(s) have unclear marks")

        questions = graded["questions"] if graded else [q.as_dict() for q in q_read]
        sid = field_out.get(INDEX_FIELD)

        out: dict[str, Any] = {
            "template": summary,
            "student_id": {k: sid[k] for k in ("value", "confidence", "issues")} if sid else None,
            "fields": field_out,
            "questions": questions,
            "graded": graded is not None,
            "score": graded["score"] if graded else None,
            "max_score": graded["max_score"] if graded else None,
            "percentage": graded["percentage"] if graded else None,
            "counts": graded["counts"] if graded else None,
            "review": {"needed": bool(review_reasons), "questions": review_q, "reasons": review_reasons},
            "alignment": {
                "method": aligned.method,
                **aligned.detail,
                "block_shifts": {str(k): v for k, v in shifts.items()},
                "sheet_corners": np.round(aligned.source_quad, 1).tolist(),
            },
            "quality": quality.as_dict(),
            "warnings": warnings,
            "stats": stats.as_dict(),
        }
        if req.include_images:
            parts = []
            if sid and sid["value"]:
                parts.append(f"ID {sid['value']}")
            if graded:
                parts.append(f"Score {graded['score']:g}/{graded['max_score']:g} ({graded['percentage']}%)")
            ann = annotate(aligned.image, q_read, all_field_cols, graded, r, "   |   ".join(parts) or None)
            out["images"] = {"annotated": to_data_url(ann), "regions": crops}
        t_end = time.perf_counter()
        out["timing_ms"] = {"align": round((t_align - t0) * 1000), "total": round((t_end - t0) * 1000)}
        return out


__all__ = ["OMREngine", "ScanRequest", "TemplateNotDetectedError", "AUTO", "DETECT"]
