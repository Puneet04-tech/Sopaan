"""Deterministic extraction. The LLM path is optional and never sees profile text.

Everything here is conservative: if a sentence does not clearly state a condition, the
field is left out and the caller is told that human review is required.
"""

from __future__ import annotations

import re
from typing import Any

INCOME_UNITS = {"lakh": 100_000, "lac": 100_000, "लाख": 100_000, "crore": 10_000_000, "करोड़": 10_000_000}

CATEGORY_WORDS = {
    "sc": "SC",
    "scheduled caste": "SC",
    "अनुसूचित जाति": "SC",
    "st": "ST",
    "scheduled tribe": "ST",
    "अनुसूचित जनजाति": "ST",
    "obc": "OBC",
    "other backward": "OBC",
    "अन्य पिछड़ा": "OBC",
    "ebc": "EBC",
    "general": "General",
    "सामान्य": "General",
}

INTEREST_WORDS = {
    "tailor": "tailoring",
    "stitch": "tailoring",
    "सिलाई": "tailoring",
    "welding": "welding",
    "वेल्डिंग": "welding",
    "beauty": "beauty",
    "पार्लर": "beauty",
    "computer": "computing",
    "कंप्यूटर": "computing",
    "nursing": "health",
    "नर्सिंग": "health",
    "agriculture": "agriculture",
    "खेती": "agriculture",
    "electric": "electrical",
    "इलेक्ट्रिक": "electrical",
}


def _number(text: str) -> float:
    return float(text.replace(",", "").replace(" ", ""))


def _has(text: str, word: str) -> bool:
    """Word-boundary matching for Latin terms; plain substring for Indic scripts."""
    if re.fullmatch(r"[a-z .]+", word):
        return re.search(rf"\b{re.escape(word)}\b", text) is not None
    return word in text


def extract_profile(text: str) -> dict[str, Any]:
    lowered = text.lower()
    fields: dict[str, Any] = {}
    confidence: dict[str, float] = {}
    notes: list[str] = []

    match = re.search(r"(?:class|कक्षा|इयत्ता)\s*(?:level\s*)?(\d{1,2})", lowered)
    if match:
        fields["class_level"] = int(match.group(1))
        confidence["class_level"] = 0.9

    match = re.search(
        r"(?:income|आय|कमाई)[^\d]{0,30}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|लाख|crore|करोड़)?",
        lowered,
    )
    if match:
        value = _number(match.group(1))
        unit = (match.group(2) or "").lower()
        if unit:
            value *= INCOME_UNITS.get(unit, 1)
        fields["family_income"] = int(value)
        confidence["family_income"] = 0.85 if unit else 0.6
        if not unit and value < 1000:
            notes.append("Income had no unit; treated as rupees. Confirm it is not thousands.")
            confidence["family_income"] = 0.4

    for word, category in CATEGORY_WORDS.items():
        if _has(lowered, word):
            fields["category"] = category
            confidence["category"] = 0.85
            break

    if any(_has(lowered, word) for word in ("female", "girl", "woman", "महिला", "लड़की")):
        fields["gender"] = "female"
        confidence["gender"] = 0.9
    elif any(_has(lowered, word) for word in ("male", "boy", "man", "पुरुष", "लड़का")):
        fields["gender"] = "male"
        confidence["gender"] = 0.9

    match = re.search(r"(\d{1,3})\s*(?:%|percent|प्रतिशत)", lowered)
    if not match:
        match = re.search(r"(?:marks|अंक)\s*[:=]?\s*(\d{1,3})", lowered)
    if match:
        fields["marks_percent"] = int(match.group(1))
        confidence["marks_percent"] = 0.85

    interests = sorted({interest for word, interest in INTEREST_WORDS.items() if word in lowered})
    if interests:
        fields["interests"] = interests
        confidence["interests"] = 0.6
        notes.append("Interests are inferred from keywords and only affect suggestions, never eligibility.")

    required = ["class_level", "family_income", "category", "gender"]
    missing = [field for field in required if field not in fields]
    if missing:
        notes.append("Missing fields stay unknown; they are never guessed.")
    return {"fields": fields, "confidence": confidence, "missing": missing, "notes": notes, "provider": "deterministic"}


def extract_rules(text: str, locale: str = "en") -> dict[str, Any]:
    lowered = text.lower()
    leaves: list[dict[str, Any]] = []
    assumptions: list[str] = []
    unparsed: list[str] = []

    class_match = re.search(r"(?:class|कक्षा|इयत्ता)\s*(\d{1,2})", lowered)
    if class_match:
        level = int(class_match.group(1))
        leaves.append(
            {
                "id": "c_class",
                "logic": {">=": [{"var": "class_level"}, level]},
                "needs": ["class_level"],
                "source": f"class {level} and above",
            }
        )
        assumptions.append(f"Interpreting class {level} as a minimum, not an exact class.")
    else:
        unparsed.append("class threshold")

    income_match = re.search(
        r"(?:income|आय|कमाई)[^\d]{0,40}?(?:up to|below|under|at most|≤|<=|से कम)?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|लाख|crore|करोड़)?",
        lowered,
    )
    if income_match:
        value = _number(income_match.group(1))
        unit = (income_match.group(2) or "").lower()
        if unit:
            value *= INCOME_UNITS.get(unit, 1)
        leaves.append(
            {
                "id": "c_income",
                "logic": {"<=": [{"var": "family_income"}, int(value)]},
                "needs": ["family_income"],
                "source": f"family income up to {int(value)}",
            }
        )
        assumptions.append("Income is annual household income in rupees.")
    else:
        unparsed.append("income ceiling")

    categories = []
    for word, category in CATEGORY_WORDS.items():
        if _has(lowered, word) and category not in categories:
            categories.append(category)
    if categories:
        leaves.append(
            {
                "id": "c_category",
                "logic": {"in": [{"var": "category"}, categories]},
                "needs": ["category"],
                "source": f"category in {', '.join(categories)}",
            }
        )

    if any(_has(lowered, word) for word in ("girl", "girls", "female", "women", "महिला", "लड़की")):
        leaves.append(
            {
                "id": "c_gender",
                "logic": {"==": [{"var": "gender"}, "female"]},
                "needs": ["gender"],
                "source": "female applicants",
            }
        )

    marks_match = re.search(r"(\d{1,3})\s*(?:%|percent|प्रतिशत)", lowered)
    if marks_match:
        leaves.append(
            {
                "id": "c_marks",
                "logic": {">=": [{"var": "marks_percent"}, int(marks_match.group(1))]},
                "needs": ["marks_percent"],
                "source": f"marks at least {int(marks_match.group(1))}%",
            }
        )

    # Every extracted draft is review-required: automation proposes, humans publish.
    review_required = True
    rules = [dict(leaf) for leaf in leaves]
    if not leaves:
        # Fail closed: an unparsed scheme must never become "everyone is eligible".
        criteria: dict[str, Any] = {"all": [{"id": "c_manual", "logic": {"==": [1, 0]}, "needs": []}]}
    else:
        criteria = {"all": [{"id": leaf["id"], "logic": leaf["logic"], "needs": leaf["needs"]} for leaf in leaves]}

    return {
        "criteria": criteria,
        "rules": rules,
        "assumptions": assumptions,
        "unparsed": unparsed,
        "review_required": review_required,
        "provider": "deterministic",
        "locale": locale,
        "note": "Extracted rules are a draft. Two human reviewers must confirm them against the official source before publication.",
    }


def explain(outcome: str, scheme_name: str, failing_rule: str | None, missing: list[str], locale: str = "en") -> str:
    field_names = {
        "class_level": ("class", "कक्षा"),
        "family_income": ("family income", "पारिवारिक आय"),
        "category": ("category", "वर्ग"),
        "gender": ("gender", "लिंग"),
        "marks_percent": ("marks %", "अंक %"),
    }
    if outcome == "ELIGIBLE":
        return (
            f"All stated conditions for {scheme_name} match your profile. This is a guide, not an approval — the office verifies documents."
            if locale == "en"
            else f"{scheme_name} की सभी लिखित शर्तें आपकी प्रोफ़ाइल से मेल खाती हैं। यह मार्गदर्शन है, स्वीकृति नहीं — दस्तावेज़ दफ़्तर में जाँचे जाएँगे।"
        )
    if outcome == "NEED_INFO":
        listed = ", ".join(field_names.get(field, (field, field))[0 if locale == "en" else 1] for field in missing)
        return (
            f"Some information is missing for {scheme_name}: {listed}. Add it to see a real answer; the app will not guess."
            if locale == "en"
            else f"{scheme_name} के लिए कुछ जानकारी अनुपलब्ध है: {listed}। असली उत्तर के लिए इसे भरें; ऐप अनुमान नहीं लगाता।"
        )
    rule = failing_rule or "a stated condition"
    return (
        f"{scheme_name} does not match because {rule} is not met. The rule and its source are shown with the result."
        if locale == "en"
        else f"{scheme_name} मेल नहीं खाता क्योंकि {rule} की शर्त पूरी नहीं होती। नतीजे के साथ नियम और उसका स्रोत दिखाया जाता है।"
    )
