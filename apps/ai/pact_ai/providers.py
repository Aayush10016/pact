from typing import Protocol

from pact_ai.schemas import Assessment, AssessmentRequest


class ProviderUnavailable(RuntimeError):
    pass


class AIProvider(Protocol):
    async def assess(self, request: AssessmentRequest) -> Assessment: ...


class NvidiaNimProvider:
    async def assess(self, request: AssessmentRequest) -> Assessment:
        raise ProviderUnavailable("NVIDIA NIM is not implemented in Phase 1.")


class OpenAIProvider:
    async def assess(self, request: AssessmentRequest) -> Assessment:
        raise ProviderUnavailable("OpenAI fallback is not implemented in Phase 1.")


async def validated_assessment(provider: AIProvider, request: AssessmentRequest) -> Assessment:
    # Provider output is untrusted. Validate before crossing service boundaries.
    output = Assessment.model_validate(await provider.assess(request))
    known = {e.id for e in request.evidence}
    if not set(output.supportingEvidence + output.conflictingEvidence).issubset(known):
        raise ValueError("Assessment cites unknown evidence.")
    return output
