"""Answer keys and scoring."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .reader import ItemReading


@dataclass
class ScoringPolicy:
    points_correct: float = 1.0
    points_wrong: float = 0.0  # use e.g. -0.25 for negative marking
    points_blank: float = 0.0
    # multiple marks are wrong unless every mark is an accepted answer and this is True
    allow_multiple_if_all_correct: bool = False

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "ScoringPolicy":
        if not d:
            return cls()
        return cls(
            points_correct=float(d.get("points_correct", 1.0)),
            points_wrong=float(d.get("points_wrong", 0.0)),
            points_blank=float(d.get("points_blank", 0.0)),
            allow_multiple_if_all_correct=bool(d.get("allow_multiple_if_all_correct", False)),
        )


AnswerKey = dict[str, list[str]]  # question label -> accepted options ([] = not graded)


def parse_answer_key(raw: Any, options: tuple[str, ...]) -> AnswerKey:
    """Accepts:

    * ``["B", "E", "A"]`` - list, index 0 = question 1. ``"AC"`` means A or C accepted.
    * ``{"1": "B", "2": ["A", "C"]}`` - mapping by question number.
    * ``"BEACB"`` - compact string (one letter per question).
    Empty / null entries mean the question is not graded.
    """
    key: AnswerKey = {}
    valid = set(options)

    def norm(v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, int):
            if not 0 <= v < len(options):
                raise ValueError(f"answer index {v} out of range")
            return [options[v]]
        if isinstance(v, str):
            letters = [c for c in v.upper() if not c.isspace() and c not in ",/|"]
        else:
            letters = [str(x).upper() for x in v]
        bad = [c for c in letters if c not in valid]
        if bad:
            raise ValueError(f"invalid option(s) {bad}; allowed {''.join(options)}")
        return sorted(set(letters), key=options.index)

    if raw is None:
        return key
    if isinstance(raw, str):
        raw = list(raw.strip())
    if isinstance(raw, list):
        for i, v in enumerate(raw):
            key[str(i + 1)] = norm(v)
    elif isinstance(raw, dict):
        for k, v in raw.items():
            key[str(int(k))] = norm(v)
    else:
        raise ValueError("answer_key must be a list, string or object")
    return key


def grade(readings: list[ItemReading], key: AnswerKey, policy: ScoringPolicy) -> dict[str, Any]:
    per_q: list[dict[str, Any]] = []
    score = 0.0
    max_score = 0.0
    counts = {"correct": 0, "wrong": 0, "blank": 0, "multiple": 0, "ungraded": 0}
    for r in readings:
        accepted = key.get(r.label, [])
        entry = r.as_dict()
        entry["key"] = accepted
        if not accepted:
            entry["result"] = "ungraded"
            entry["points"] = 0.0
            counts["ungraded"] += 1
            per_q.append(entry)
            continue
        max_score += policy.points_correct
        if r.status == "blank":
            res, pts = "blank", policy.points_blank
            counts["blank"] += 1
        elif r.status == "multiple":
            if policy.allow_multiple_if_all_correct and set(r.marked) <= set(accepted):
                res, pts = "correct", policy.points_correct
                counts["correct"] += 1
            else:
                res, pts = "multiple", policy.points_wrong
                counts["multiple"] += 1
        elif r.marked[0] in accepted:
            res, pts = "correct", policy.points_correct
            counts["correct"] += 1
        else:
            res, pts = "wrong", policy.points_wrong
            counts["wrong"] += 1
        entry["result"] = res
        entry["points"] = pts
        score += pts
        per_q.append(entry)
    pct = round(100.0 * score / max_score, 2) if max_score > 0 else None
    return {
        "score": round(score, 3),
        "max_score": round(max_score, 3),
        "percentage": pct,
        "counts": counts,
        "questions": per_q,
    }
