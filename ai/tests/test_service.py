import json
from pathlib import Path

import httpx
import pytest

from service import app

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "packs" / "schemes-mh" / "2026.10.14-1.json"
TAMPERED = ROOT / "packs" / "vectors" / "tampered-signature.json"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def call(method: str, path: str, payload: dict | None = None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, json=payload)


@pytest.mark.anyio
async def test_health_works_without_any_model():
    response = await call("GET", "/health")
    assert response.status_code == 200
    assert response.json()["status"] == "UP"


@pytest.mark.anyio
async def test_profile_extraction_english():
    response = await call(
        "POST",
        "/v1/profile:extract",
        {"text": "Radha is a girl in class 10, OBC, family income Rs 1,80,000, marks 68%, interested in tailoring."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["class_level"] == 10
    assert body["fields"]["category"] == "OBC"
    assert body["fields"]["gender"] == "female"
    assert body["fields"]["family_income"] == 180000
    assert body["fields"]["marks_percent"] == 68
    assert body["provider"] == "deterministic"


@pytest.mark.anyio
async def test_profile_extraction_hindi_and_missing_fields():
    response = await call("POST", "/v1/profile:extract", {"text": "मेरी बेटी कक्षा 11 में है, महिला, आय ₹2 लाख", "locale": "hi"})
    body = response.json()
    assert body["fields"]["class_level"] == 11
    assert body["fields"]["family_income"] == 200000
    assert body["fields"]["gender"] == "female"
    assert "category" in body["missing"]
    assert "gender" not in body["missing"]


@pytest.mark.anyio
async def test_rules_extraction_and_fail_closed():
    response = await call(
        "POST",
        "/v1/rules:extract",
        {"text": "Students from Class 11 and above with family income up to Rs 2.5 lakh, OBC or SC."},
    )
    body = response.json()
    criteria = body["criteria"]["all"]
    assert [leaf["id"] for leaf in criteria] == ["c_class", "c_income", "c_category"]
    assert criteria[1]["logic"]["<="][1] == 250000
    assert body["review_required"] is True

    unpard = await call("POST", "/v1/rules:extract", {"text": "Contact the district office for details."})
    assert unpard.json()["review_required"] is True
    assert unpard.json()["criteria"]["all"][0]["id"] == "c_manual"


@pytest.mark.anyio
async def test_explain_need_info_names_fields():
    response = await call(
        "POST",
        "/v1/explain",
        {"scheme_name": "Post Matric Scholarship", "outcome": "NEED_INFO", "missing": ["income"], "locale": "en"},
    )
    assert "income" in response.json()["text"].lower()
    assert response.json()["provider"] == "template"


@pytest.mark.anyio
async def test_valid_pack_and_tampered_pack():
    envelope = json.loads(PACK.read_text(encoding="utf-8"))
    valid = await call("POST", "/v1/packs:validate", {"envelope": envelope})
    assert valid.status_code == 200
    assert valid.json()["ok"] is True, valid.json()["errors"]
    assert valid.json()["schemes"] >= 3

    tampered = json.loads(TAMPERED.read_text(encoding="utf-8"))
    bad = await call("POST", "/v1/packs:validate", {"envelope": tampered})
    assert bad.json()["ok"] is False
    assert "bad_signature" in bad.json()["errors"]


@pytest.mark.anyio
async def test_fairness_report_is_deterministic():
    envelope = json.loads(PACK.read_text(encoding="utf-8"))
    first = await call("POST", "/v1/fairness:report", {"envelope": envelope})
    second = await call("POST", "/v1/fairness:report", {"envelope": envelope})
    assert first.status_code == 200
    assert first.json() == second.json()
    assert first.json()["panel_size"] > 0
    assert isinstance(first.json()["flagged"], list)
