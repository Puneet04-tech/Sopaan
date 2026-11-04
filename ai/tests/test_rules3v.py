import json
from pathlib import Path

from rules3v import evaluate_eligibility

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "packs" / "vectors" / "eligibility.json"


def matches(expected, actual):
    if expected == "ELIGIBLE":
        return actual["outcome"] == "ELIGIBLE"
    if expected.startswith("NOT:"):
        return actual["outcome"] == "NOT_ELIGIBLE" and actual["rule"] == expected[4:]
    if expected.startswith("NEED:"):
        fields = sorted(field.strip() for field in expected[5:].strip("[]").split(",") if field.strip())
        return actual["outcome"] == "NEED_INFO" and sorted(actual["missing"]) == fields
    return False


def test_python_matches_shared_vectors():
    vectors = json.loads(VECTORS.read_text(encoding="utf-8"))
    failures = []
    for case in vectors["cases"]:
        actual = evaluate_eligibility(case["criteria"], case["profile"], case.get("confidence") or {})
        if not matches(case["expect"], actual):
            failures.append(f"{case['scheme_id']}: expected {case['expect']} got {actual}")
    assert vectors["cases"], "vectors are empty"
    assert failures == []
