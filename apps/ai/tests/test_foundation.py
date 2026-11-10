import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from pact_ai.main import app
from pact_ai.providers import NvidiaNimProvider, ProviderUnavailable, validated_assessment
from pact_ai.schemas import Assessment, AssessmentRequest

client = TestClient(app)
request = AssessmentRequest(
    pactId="p1",
    commitment="Build a responsive five-page website.",
    evidence=[{"id": "ev1", "content": "A delivery receipt."}],
)
base = {
    "status": "UNCLEAR",
    "confidence": 0.3,
    "supportingEvidence": ["ev1"],
    "conflictingEvidence": [],
    "missingEvidence": ["Final deployment"],
    "reasoningSummary": "Deployment evidence is missing.",
    "recommendation": {"type": "REQUEST_EVIDENCE"},
}


def test_health_and_provider_capabilities():
    assert client.get("/health").json()["data"]["status"] == "ok"
    assert client.get("/v1/providers").json()["data"]["enabled"] is False


def test_unavailable_reasoning_is_explicit(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-service-key")
    response = client.post(
        "/v1/assessments",
        json=request.model_dump(),
        headers={"x-pact-service-key": "test-service-key"},
    )
    assert response.status_code == 503
    assert (
        client.post(
            "/v1/assessments", json={}, headers={"x-pact-service-key": "test-service-key"}
        ).status_code
        == 422
    )
    with pytest.raises(ProviderUnavailable):
        asyncio.run(NvidiaNimProvider().assess(request))


def test_schema_rejects_unsafe_and_out_of_range_output():
    for changes in [
        {"confidence": 2},
        {"executePayment": True},
        {"recommendation": {"type": "PARTIAL_REFUND", "percentage": 100}},
    ]:
        with pytest.raises(ValidationError):
            Assessment.model_validate({**base, **changes})


def test_provider_boundary_rejects_invented_evidence():
    class FakeProvider:
        async def assess(self, request):
            return {**base, "supportingEvidence": ["invented"]}

    with pytest.raises(ValueError, match="unknown evidence"):
        asyncio.run(validated_assessment(FakeProvider(), request))


def test_provider_abstraction_accepts_valid_structured_output():
    class FakeProvider:
        async def assess(self, request):
            return base

    assert asyncio.run(validated_assessment(FakeProvider(), request)).status == "UNCLEAR"
