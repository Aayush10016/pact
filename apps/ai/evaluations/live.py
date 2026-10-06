"""Opt-in real NVIDIA evaluation; synthetic evidence only, sanitized report output."""

import asyncio
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from pact_ai.providers import (
    InvalidAssessment,
    NvidiaNimProvider,
    ProviderUnavailable,
    validated_assessment,
)
from pact_ai.schemas import AssessmentRequest, CommitmentExtractionRequest


async def run():
    provider = NvidiaNimProvider()
    results = []
    agreement = (
        "Deliver a report with five sections by 2030-01-15. "
        "Milestone: submit a draft by 2030-01-10. "
        "Deliverables: the final PDF and editable source. Acceptance requires all five sections."
    )
    try:
        output = await provider.extract_commitments(
            CommitmentExtractionRequest(agreement=agreement)
        )
        results.append(
            {
                "case": "commitment-extraction",
                "pass": bool(output.commitments),
                "commitments": len(output.commitments),
            }
        )
    except Exception as error:
        results.append(
            {
                "case": "commitment-extraction",
                "pass": False,
                "error": type(error).__name__,
                "category": str(error)
                if isinstance(error, (ProviderUnavailable, InvalidAssessment))
                else "OUTPUT_INVALID",
                "cause": type(error.__cause__).__name__,
            }
        )
    for case in json.loads(Path(__file__).with_name("cases.json").read_text()):
        if len(sys.argv) > 1 and case["name"] != sys.argv[1]:
            continue
        request = AssessmentRequest(
            pactId="synthetic-evaluation",
            commitments=[
                {
                    "id": "criterion-1",
                    "description": (
                        "Deliver a report containing all five agreed sections, "
                        "supported by a delivery log."
                    ),
                }
            ],
            evidence=[{"id": "evidence-1", "content": case["content"]}],
        )
        try:
            output = await validated_assessment(provider, request)
            passed = not case["expectUnclear"] or output.status == "UNCLEAR"
            results.append(
                {
                    "case": case["name"],
                    "pass": passed,
                    "status": output.status,
                    "exactCitations": sum(len(c.citations) for c in output.commitments),
                }
            )
        except Exception as error:
            validation = (
                [
                    {"field": ".".join(str(x) for x in item["loc"]), "type": item["type"]}
                    for item in error.errors(include_input=False, include_context=False)
                ]
                if isinstance(error, ValidationError)
                else []
            )
            results.append(
                {
                    "case": case["name"],
                    "pass": False,
                    "error": type(error).__name__,
                    "category": str(error)
                    if isinstance(error, (ProviderUnavailable, InvalidAssessment))
                    else "OUTPUT_INVALID",
                    "cause": type(error.__cause__).__name__,
                    "validation": validation,
                }
            )
    print(
        json.dumps(
            {
                "provider": "real-nvidia-nim",
                "confidence": "a bounded model estimate, not measured statistical calibration",
                "results": results,
            }
        )
    )
    return all(r["pass"] for r in results)


if __name__ == "__main__":
    raise SystemExit(0 if asyncio.run(run()) else 1)
