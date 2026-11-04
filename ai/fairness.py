"""Synthetic fairness panel for a signed rule pack.

This is a warning tool, not a certificate. It runs every scheme over a deterministic
cross-product of learner profiles and reports selection rates per group. A disparate
impact ratio below 0.8 is flagged for human review.
"""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path
from typing import Any

try:  # package import for pytest, plain import for `python ai/fairness.py`
    from .rules3v import evaluate_eligibility
except ImportError:
    from rules3v import evaluate_eligibility

CATEGORIES = ["General", "OBC", "SC", "ST", "EBC", "VJNT", "NT"]
GENDERS = ["female", "male"]
CLASSES = [8, 9, 10, 11, 12]
INCOMES = [80_000, 150_000, 250_000, 400_000, 800_000]
MARKS = [45, 60, 75, 90]
AGES = [14, 17, 20, 30, 45, 50]
EDUCATION = ["CLASS_8", "CLASS_10", "CLASS_12", "ITI"]


def panel(limit: int = 2000) -> list[dict[str, Any]]:
    """Evenly strided sample of the full cross-product, so every group appears."""
    full = [
        {
            "class_level": level,
            "category": category,
            "gender": gender,
            "family_income": income,
            "marks_percent": marks,
            "minority": minority,
            "disability": disability,
            "age": age,
            "education_level": education,
        }
        for (
            level,
            category,
            gender,
            income,
            marks,
            minority,
            disability,
            age,
            education,
        ) in itertools.product(
            CLASSES,
            CATEGORIES,
            GENDERS,
            INCOMES,
            MARKS,
            [False, True],
            [False, True],
            AGES,
            EDUCATION,
        )
    ]
    stride = max(1, len(full) // limit)
    return full[::stride][:limit]


def _rates(profiles: list[dict[str, Any]], criteria: dict[str, Any], field: str) -> dict[str, Any]:
    groups: dict[str, list[int]] = {}
    for profile in profiles:
        outcome = evaluate_eligibility(criteria, profile)
        key = str(profile.get(field, "unknown"))
        groups.setdefault(key, [])
        groups[key].append(1 if outcome["outcome"] == "ELIGIBLE" else 0)
    rates = {key: (sum(values) / len(values) if values else 0.0) for key, values in groups.items()}
    highest = max(rates.values()) if rates else 0.0
    ratios = {key: (rate / highest if highest else 1.0) for key, rate in rates.items()}
    return {
        "selection_rate": {key: round(value, 4) for key, value in rates.items()},
        "impact_ratio": {key: round(value, 4) for key, value in ratios.items()},
        "flagged": [key for key, value in ratios.items() if value < 0.8],
    }


def _targets(criteria: dict[str, Any], field: str) -> bool:
    return f'"var": "{field}"' in json.dumps(criteria, sort_keys=True)


def fairness_for_pack(payload: dict[str, Any], limit: int = 2000) -> dict[str, Any]:
    profiles = panel(limit)
    schemes = []
    for scheme in payload.get("schemes", []):
        criteria = scheme.get("criteria")
        by_category = _rates(profiles, criteria, "category")
        by_gender = _rates(profiles, criteria, "gender")
        # A category- or gender-targeted scheme is supposed to exclude other groups;
        # flagging that as bias would bury the real signal.
        by_category["targeted"] = _targets(criteria, "category")
        by_gender["targeted"] = _targets(criteria, "gender")
        if by_category["targeted"]:
            by_category["flagged"] = []
        if by_gender["targeted"]:
            by_gender["flagged"] = []
        schemes.append(
            {
                "scheme_id": scheme.get("id"),
                "scheme_name": (scheme.get("name") or {}).get("en", scheme.get("id")),
                "by_category": by_category,
                "by_gender": by_gender,
            }
        )
    flagged = [
        f"{scheme['scheme_id']}:{group}"
        for scheme in schemes
        for group in scheme["by_category"]["flagged"] + scheme["by_gender"]["flagged"]
    ]
    return {
        "pack": f"{payload.get('name')}@{payload.get('version')}",
        "panel_size": len(profiles),
        "schemes": schemes,
        "flagged": flagged,
        "note": "Synthetic panel, not a legal finding. Low ratios mean a human should inspect the rule and its source.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fairness panel for a signed Sopaan rule pack")
    parser.add_argument("--pack", default="../packs/schemes-mh/2026.10.14-1.json")
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    parser.add_argument("--fail-on-flag", action="store_true")
    args = parser.parse_args()

    path = Path(args.pack)
    if not path.exists():
        path = Path(__file__).resolve().parents[1] / "packs" / "schemes-mh" / "2026.10.14-1.json"
    envelope = json.loads(path.read_text(encoding="utf-8"))
    import base64

    payload = json.loads(base64.urlsafe_b64decode(envelope["payload"] + "=" * (-len(envelope["payload"]) % 4)))
    report = fairness_for_pack(payload)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Pack {report['pack']}  panel={report['panel_size']}")
        for scheme in report["schemes"]:
            print(f"\n{scheme['scheme_id']}  {scheme['scheme_name']}")
            for group, rate in scheme["by_category"]["selection_rate"].items():
                print(f"  {group:<10} selection={rate:.1%}  impact={scheme['by_category']['impact_ratio'][group]:.2f}")
            for group, rate in scheme["by_gender"]["selection_rate"].items():
                print(f"  {group:<10} selection={rate:.1%}  impact={scheme['by_gender']['impact_ratio'][group]:.2f}")
        print(f"\nFlagged: {', '.join(report['flagged']) if report['flagged'] else 'none'}")
        print(report["note"])

    if args.fail_on_flag and report["flagged"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
