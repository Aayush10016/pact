import asyncio
import copy
import io

import httpx
import pytest
from PIL import Image
from test_phase2 import request, result

from pact_ai.extractor import extract
from pact_ai.providers import (
    InvalidAssessment,
    NvidiaNimProvider,
    ProviderUnavailable,
    validated_assessment,
)
from pact_ai.schemas import CommitmentExtractionRequest


@pytest.mark.parametrize(
    "change", ["unknown-id", "invented-quote", "invented-claim", "missing-quote"]
)
def test_exact_citation_rejection(change):
    output = copy.deepcopy(result)
    analysis = output["commitments"][0]
    if change == "unknown-id":
        analysis["citations"][0]["evidenceId"] = "outside-evidence"
    elif change == "invented-quote":
        analysis["citations"][0]["quote"] = "The source files were delivered."
    elif change == "invented-claim":
        analysis["claim"] = "The source files were delivered."
    else:
        analysis["citations"] = []

    class Output:
        async def assess(self, _):
            return output

    with pytest.raises(InvalidAssessment):
        asyncio.run(validated_assessment(Output(), request))


def test_provider_timeout_fails_without_retry_or_financial_tools(monkeypatch):
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-only")
    monkeypatch.setenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-test-model")
    calls = []

    def handler(req):
        calls.append(req)
        raise httpx.ReadTimeout("bounded test timeout")

    with pytest.raises(ProviderUnavailable):
        asyncio.run(NvidiaNimProvider(httpx.MockTransport(handler)).assess(request))
    assert len(calls) == 1


def test_image_mime_and_pixel_limits():
    data = io.BytesIO()
    Image.new("RGB", (4000, 2100)).save(data, format="PNG")
    with pytest.raises(ValueError, match="IMAGE_LIMIT"):
        extract(data.getvalue(), "image/png")
    with pytest.raises(ValueError, match="IMAGE_TYPE_MISMATCH"):
        extract(b"not a photograph", "image/jpeg")


def test_commitment_extraction_requires_service_identity(monkeypatch):
    from fastapi.testclient import TestClient

    from pact_ai.main import app

    monkeypatch.setenv("AI_SERVICE_KEY", "test-only")
    payload = CommitmentExtractionRequest(agreement="Deliver all five report sections.")
    assert (
        TestClient(app).post("/v1/commitments/extract", json=payload.model_dump()).status_code
        == 403
    )
