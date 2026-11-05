"""Scantron OMR engine: template-driven optical mark recognition for MCQ sheets."""

from .grading import ScoringPolicy, parse_answer_key
from .layouts import TemplateRegistry, default_registry
from .pipeline import AUTO, DETECT, OMREngine, ScanRequest, TemplateNotDetectedError

__version__ = "2.0.0"

__all__ = [
    "AUTO",
    "DETECT",
    "OMREngine",
    "ScanRequest",
    "ScoringPolicy",
    "TemplateNotDetectedError",
    "TemplateRegistry",
    "default_registry",
    "parse_answer_key",
]
