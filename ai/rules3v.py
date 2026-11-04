"""Three-valued eligibility evaluator, ported to match tools/lib/rules3v.mjs and Java.

Leaf: TRUE / FALSE / UNKNOWN when a required field is missing.
ALL: any FALSE wins, else any UNKNOWN -> UNKNOWN, else TRUE.
ANY: any TRUE wins, else any UNKNOWN -> UNKNOWN, else FALSE.
"""

from __future__ import annotations

from typing import Any

CONFIDENCE_FLOOR = 0.5


def _known(value: Any) -> bool:
    return value is not None and value != ""


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value != ""
    return value is not None


def _literal(node: Any) -> Any:
    return node


def _logic(node: Any, values: dict[str, Any]) -> Any:
    if not isinstance(node, dict):
        return node
    if not node:
        return None
    op = next(iter(node))
    arg = node[op]

    if op == "var":
        name = arg[0] if isinstance(arg, list) else arg
        value = values.get(name)
        if value is None and isinstance(arg, list) and len(arg) > 1:
            return arg[1]
        return value
    if op == "and":
        return all(_truthy(_logic(child, values)) for child in arg)
    if op == "or":
        return any(_truthy(_logic(child, values)) for child in arg)
    if op == "!":
        return not _truthy(_logic(arg, values))
    if op == "in":
        needle = _logic(arg[0], values)
        haystack = arg[1] if isinstance(arg, list) and len(arg) > 1 else []
        return any(_equal(needle, item) for item in haystack)
    if op == "missing":
        names = arg if isinstance(arg, list) else [arg]
        return any(not _known(values.get(name)) for name in names)
    if op in ("<", "<=", ">", ">=", "==", "!="):
        left = _logic(arg[0], values)
        right = _logic(arg[1], values)
        if op == "==":
            return _equal(left, right)
        if op == "!=":
            return not _equal(left, right)
        if left is None or right is None:
            return False
        if isinstance(left, (int, float)) and isinstance(right, (int, float)):
            comparison = (left > right) - (left < right)
        else:
            comparison = (str(left) > str(right)) - (str(left) < str(right))
        return {"<": comparison < 0, "<=": comparison <= 0, ">": comparison > 0, ">=": comparison >= 0}[op]
    return None


def _equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return _truthy(left) == _truthy(right)
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return float(left) == float(right)
    return str(left) == str(right)


def evaluate_node(node: dict[str, Any] | None, values: dict[str, Any], confidence: dict[str, float] | None = None, rule_prefix: str = "") -> dict[str, Any]:
    confidence = confidence or {}
    if not node:
        return {"value": "TRUE", "missing": [], "failing": None}

    if isinstance(node.get("all"), list) or isinstance(node.get("any"), list):
        is_all = isinstance(node.get("all"), list)
        children = node["all"] if is_all else node["any"]
        results = [
            evaluate_node(child, values, confidence, child.get("id") or f"{rule_prefix}[{index}]")
            for index, child in enumerate(children)
        ]

        if is_all:
            for result in results:
                if result["value"] == "FALSE":
                    return {"value": "FALSE", "missing": [], "failing": result.get("failing")}
            if any(result["value"] == "UNKNOWN" for result in results):
                missing = sorted({field for result in results for field in result["missing"]})
                return {"value": "UNKNOWN", "missing": missing, "failing": None}
            return {"value": "TRUE", "missing": [], "failing": None}

        for result in results:
            if result["value"] == "TRUE":
                return {"value": "TRUE", "missing": [], "failing": None}
        if any(result["value"] == "UNKNOWN" for result in results):
            missing = sorted({field for result in results for field in result["missing"]})
            return {"value": "UNKNOWN", "missing": missing, "failing": None}
        return {"value": "FALSE", "missing": [], "failing": results[0].get("failing") if results else None}

    needs = node.get("needs") or []
    missing = [
        field
        for field in needs
        if not _known(values.get(field))
        or (isinstance(confidence.get(field), (int, float)) and confidence[field] < CONFIDENCE_FLOOR)
    ]
    if missing:
        return {"value": "UNKNOWN", "missing": missing, "failing": None, "id": node.get("id")}

    try:
        truthy = _truthy(_logic(node.get("logic"), values))
    except Exception:
        truthy = False
    return {"value": "TRUE" if truthy else "FALSE", "missing": [], "failing": None if truthy else node.get("id"), "id": node.get("id")}


def evaluate_eligibility(criteria: dict[str, Any] | None, values: dict[str, Any], confidence: dict[str, float] | None = None) -> dict[str, Any]:
    result = evaluate_node(criteria, values, confidence)
    if result["value"] == "TRUE":
        return {"outcome": "ELIGIBLE", "rule": None, "missing": []}
    if result["value"] == "FALSE":
        return {"outcome": "NOT_ELIGIBLE", "rule": result.get("failing"), "missing": []}
    return {"outcome": "NEED_INFO", "rule": None, "missing": result["missing"]}
