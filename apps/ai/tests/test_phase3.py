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


def test_resume_artifact_preserves_its_recorded_commitment_and_exact_support(monkeypatch):
    import json

    from pact_ai.schemas import AssessmentRequest

    artifact = "Backend developer. Python, FastAPI, PostgreSQL. Built REST APIs."
    resume = AssessmentRequest(
        pactId="pact",
        commitments=[
            {
                "id": "resume",
                "description": "Make a resume for backend developer. Acceptance: 80% of work done.",
            }
        ],
        evidence=[{"id": "pdf-version", "commitmentId": "resume", "content": artifact}],
    )
    output = {
        "status": "FULFILLED",
        "confidence": 0.8,
        "supportingEvidence": ["pdf-version"],
        "conflictingEvidence": [],
        "missingEvidence": [],
        "reasoningSummary": (
            "The supplied resume describes backend skills. The percentage is not a defined rubric."
        ),
        "recommendation": {"type": "NO_ACTION"},
        "commitments": [
            {
                "commitmentId": "resume",
                "status": "FULFILLED",
                "evidenceIds": ["pdf-version"],
                "claim": "Built REST APIs.",
                "citations": [{"evidenceId": "pdf-version", "quote": "Built REST APIs."}],
                "inference": "This artifact addresses the requested role.",
                "uncertainty": "No numerical rubric agreed.",
            }
        ],
    }
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-only")
    monkeypatch.setenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-test-model")

    def handler(req):
        body = json.loads(req.content)
        context = json.loads(body["messages"][1]["content"])["untrustedContext"]
        assert context["evidence"][0]["commitmentId"] == "resume"
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(output)}}]})

    assessed = asyncio.run(
        validated_assessment(NvidiaNimProvider(httpx.MockTransport(handler)), resume)
    )
    assert assessed.commitments[0].status == "FULFILLED"
    assert assessed.commitments[0].claim in artifact


def test_evidence_linked_to_other_commitment_cannot_support_a_conclusion():
    from pact_ai.schemas import AssessmentRequest

    other = request.model_dump()
    other["evidence"][0]["commitmentId"] = "other-commitment"

    class Output:
        async def assess(self, _):
            return result

    with pytest.raises(InvalidAssessment, match="different commitment"):
        asyncio.run(validated_assessment(Output(), AssessmentRequest.model_validate(other)))


@pytest.mark.parametrize(
    "quote,source,expected",
    [
        ("Java Backend Development", "Java\nBackend  Development", "Java\nBackend  Development"),
        ("Delivered REST APIs", "Delivered SOAP APIs", None),
        ("Java backend", "Java Backend", None),
        ("API completed!", "API completed?", None),
    ],
)
def test_pdf_citations_restore_only_whitespace(quote, source, expected):
    from pact_ai.providers import exact_source_span

    assert exact_source_span(quote, source) == expected


def test_canonicalized_citations_remain_exact_source_and_reject_invented_words():
    from pact_ai.providers import restore_citation_whitespace
    from pact_ai.schemas import Assessment, AssessmentRequest

    original = "Backend developer.\nBuilt REST APIs."
    req = AssessmentRequest(
        pactId="p",
        commitments=[{"id": "c1", "description": "Deliver a backend developer resume."}],
        evidence=[{"id": "e1", "content": original}],
    )
    output = copy.deepcopy(result)
    output.update(status="FULFILLED", confidence=0.8, missingEvidence=[])
    c = output["commitments"][0]
    c.update(
        status="FULFILLED",
        claim="Backend developer. Built REST APIs.",
        citations=[{"evidenceId": "e1", "quote": "Backend developer. Built REST APIs."}],
        deliverableMatch=90,
    )
    fixed = restore_citation_whitespace(Assessment.model_validate(output), req)
    assert fixed.commitments[0].citations[0].quote == original
    assert fixed.commitments[0].claim == original

    class Output:
        async def assess(self, _):
            return fixed

    assert asyncio.run(validated_assessment(Output(), req)).commitments[0].deliverableMatch == 90


def test_match_estimate_requires_cited_content_even_when_contractual_status_is_unclear():
    from pact_ai.schemas import Assessment

    output = copy.deepcopy(result)
    output.update(status="UNCLEAR", confidence=0.4)
    output["commitments"][0].update(status="UNCLEAR", deliverableMatch=85)

    class Output:
        async def assess(self, _):
            return Assessment.model_validate(output)

    assert (
        asyncio.run(validated_assessment(Output(), request)).commitments[0].deliverableMatch == 85
    )
    output["commitments"][0].update(claim="", citations=[], evidenceIds=[])
    with pytest.raises(InvalidAssessment, match="Match estimate lacks"):
        asyncio.run(validated_assessment(Output(), request))
