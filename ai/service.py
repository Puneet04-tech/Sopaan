"""Sopaan AI sidecar: optional, narrow-assist, fail-closed.

Endpoints are deliberately small: extract a draft rule set, extract profile fields from a
sentence, explain an existing outcome, and validate a signed pack. The service never issues
credentials, never decides eligibility on its own, and never sees raw audio.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:  # imported as a package (pytest) or as a script (python ai/run.py)
    from .extract import explain, extract_profile, extract_rules
    from .fairness import fairness_for_pack
except ImportError:
    from extract import explain, extract_profile, extract_rules
    from fairness import fairness_for_pack

ROOT = Path(__file__).resolve().parents[1]
TRUST_PATH = ROOT / "packs" / "trust.json"

app = FastAPI(
    title="Sopaan rules assistant",
    version="1.0.0",
    description="Optional AI sidecar. Deterministic by default; every suggestion needs human review.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("SOPAAN_WEB_ORIGIN", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    locale: str = Field(default="en", pattern="^(en|hi|mr)$")


class ExplainRequest(BaseModel):
    scheme_name: str = Field(min_length=1, max_length=160)
    outcome: str = Field(pattern="^(ELIGIBLE|NOT_ELIGIBLE|NEED_INFO)$")
    failing_rule: str | None = None
    missing: list[str] = Field(default_factory=list)
    locale: str = Field(default="en", pattern="^(en|hi|mr)$")


class PackRequest(BaseModel):
    envelope: dict[str, Any]


def _b64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _root_public_key() -> str:
    trust = json.loads(TRUST_PATH.read_text(encoding="utf-8"))
    kid = trust["root_kid"]
    return trust["keys"][kid]["public_key"]


def _verify(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

        key = Ed25519PublicKey.from_public_bytes(_b64(public_key_b64))
        key.verify(_b64(signature_b64), message)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
    except Exception:
        return False


def validate_pack(envelope: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(envelope, dict) or "payload" not in envelope or "sig" not in envelope:
        return {"ok": False, "errors": ["envelope_missing"], "version": None}
    if envelope.get("v") != 1:
        errors.append("unsupported_version")
    if envelope.get("typ") != "pack":
        errors.append("not_a_pack")

    payload_bytes = _b64(envelope["payload"])
    try:
        payload = json.loads(payload_bytes)
    except (ValueError, json.JSONDecodeError):
        return {"ok": False, "errors": errors + ["payload_not_json"], "version": None}

    signer = payload.get("signer") or {}
    if not signer.get("pubkey") or not signer.get("root_sig"):
        errors.append("signer_missing")
    else:
        record = {"kid": signer.get("kid"), "pubkey": signer.get("pubkey"), "role": signer.get("role")}
        if not _verify(_root_public_key(), _canonical(record).encode("utf-8"), signer["root_sig"]):
            errors.append("signer_not_root_signed")
        if not _verify(signer["pubkey"], payload_bytes, envelope["sig"]):
            errors.append("bad_signature")

    for entry in payload.get("manifest", []):
        section = payload.get(entry.get("file"))
        if section is None:
            errors.append(f"section_missing:{entry.get('file')}")
        elif _sha256(_canonical(section)) != entry.get("sha256"):
            errors.append(f"section_hash_mismatch:{entry.get('file')}")

    if not payload.get("expires_at"):
        errors.append("expiry_missing")
    if len(payload.get("reviewers") or []) < 2:
        errors.append("reviewers_below_quorum")

    return {
        "ok": not errors,
        "errors": errors,
        "version": payload.get("version"),
        "sections": [entry.get("file") for entry in payload.get("manifest", [])],
        "schemes": len(payload.get("schemes", [])),
    }


def _llm_rules(text: str, locale: str) -> dict[str, Any] | None:
    """Optional OpenAI-compatible draft. Never called for profile text."""
    if os.getenv("SOPAAN_AI_PROVIDER", "deterministic") != "openai":
        return None
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("SOPAAN_AI_MODEL", "gpt-4o-mini")
    system = (
        "You convert scheme eligibility text into a strict JSON criteria tree. "
        "Use only these leaf ids: c_class, c_income, c_category, c_gender, c_marks. "
        "Each leaf is {\"id\":string,\"logic\":JsonLogic,\"needs\":[field]}. "
        "Never invent a condition; put unparsed text in unparsed. Return JSON only."
    )
    body = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Locale: {locale}\nText:\n{text}"},
        ],
    }
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        if not isinstance(parsed.get("criteria"), dict):
            return None
        return {
            "criteria": parsed["criteria"],
            "rules": parsed.get("rules", []),
            "assumptions": parsed.get("assumptions", []),
            "unparsed": parsed.get("unparsed", []),
            "review_required": True,
            "provider": f"openai-compatible:{model}",
            "locale": locale,
            "note": "Model draft. Two human reviewers must verify it against the official source.",
        }
    except Exception:
        return None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "UP",
        "service": "sopaan-ai",
        "provider": "openai" if os.getenv("SOPAAN_AI_PROVIDER") == "openai" and os.getenv("OPENAI_API_KEY") else "deterministic",
        "note": "Optional sidecar. The app works fully without it.",
    }


@app.post("/v1/profile:extract")
def profile_extract(request: TextRequest) -> dict[str, Any]:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text_required")
    return extract_profile(request.text)


@app.post("/v1/rules:extract")
def rules_extract(request: TextRequest) -> dict[str, Any]:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text_required")
    try:
        return _llm_rules(request.text, request.locale) or extract_rules(request.text, request.locale)
    except Exception:
        return extract_rules(request.text, request.locale)


@app.post("/v1/explain")
def explain_outcome(request: ExplainRequest) -> dict[str, Any]:
    return {
        "text": explain(request.outcome, request.scheme_name, request.failing_rule, request.missing, request.locale),
        "provider": "template",
        "locale": request.locale,
        "note": "Generated from the signed rule result; no model call.",
    }


@app.post("/v1/packs:validate")
def packs_validate(request: PackRequest) -> dict[str, Any]:
    return validate_pack(request.envelope)


@app.post("/v1/fairness:report")
def fairness_report(request: PackRequest) -> dict[str, Any]:
    result = validate_pack(request.envelope)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail={"errors": result["errors"]})
    payload = json.loads(_b64(request.envelope["payload"]))
    return fairness_for_pack(payload)
