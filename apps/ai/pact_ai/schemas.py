from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")


class Recommendation(StrictModel):
    type: Literal["NO_ACTION", "REQUEST_EVIDENCE", "PARTIAL_REFUND", "FULL_REFUND"]
    percentage: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_percentage(self):
        if self.type == "PARTIAL_REFUND":
            if self.percentage is None or not 0 < self.percentage < 100:
                raise ValueError("Partial refunds require a percentage between 1 and 99.")
        elif self.percentage is not None:
            raise ValueError("Percentage is only valid for partial refunds.")
        return self


class EvidenceCitation(StrictModel):
    evidenceId: str = Field(min_length=1, max_length=100)
    quote: str = Field(min_length=1, max_length=1000)


class CommitmentExtractionRequest(StrictModel):
    agreement: str = Field(min_length=20, max_length=20000)


class ExtractedMilestone(StrictModel):
    title: str = Field(min_length=3, max_length=120)
    deadline: str | None = Field(default=None, max_length=100)
    sourceQuote: str = Field(min_length=1, max_length=1000)


class ExtractedCommitment(StrictModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=4000)
    criteria: list[str] = Field(max_length=20)
    deliverables: list[str] = Field(max_length=20)
    deadline: str | None = Field(default=None, max_length=100)
    milestones: list[ExtractedMilestone] = Field(max_length=20)
    sourceQuote: str = Field(min_length=1, max_length=1000)


class CommitmentExtraction(StrictModel):
    commitments: list[ExtractedCommitment] = Field(min_length=1, max_length=20)
    uncertainty: list[str] = Field(max_length=20)


class CommitmentAssessment(StrictModel):
    deliverableMatch: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Required advisory artifact-to-deliverable match estimate, separate from "
        "contractual status. Give a number when cited content is assessable, even if status is "
        "UNCLEAR; null only when no artifact content can be assessed. A backend resume with "
        "backend skills and projects can match well despite an undefined acceptance rubric.",
    )
    commitmentId: str
    status: Literal["FULFILLED", "PARTIALLY_FULFILLED", "UNFULFILLED", "UNCLEAR"]
    evidenceIds: list[str] = Field(max_length=50)
    claim: str = Field(max_length=1000)
    inference: str = Field(max_length=1000)
    uncertainty: str = Field(max_length=1000)
    citations: list[EvidenceCitation] = Field(default_factory=list, max_length=50)


class Assessment(StrictModel):
    commitments: list[CommitmentAssessment] = Field(default_factory=list, max_length=20)
    status: Literal["FULFILLED", "PARTIALLY_FULFILLED", "UNFULFILLED", "UNCLEAR"]
    confidence: float = Field(ge=0, le=1)
    supportingEvidence: list[Annotated[str, Field(min_length=1)]] = Field(max_length=100)
    conflictingEvidence: list[Annotated[str, Field(min_length=1)]] = Field(max_length=100)
    missingEvidence: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        max_length=100
    )
    reasoningSummary: str = Field(min_length=1, max_length=4000)
    recommendation: Recommendation


class EvidenceReference(StrictModel):
    commitmentId: str | None = Field(default=None, max_length=100)
    id: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=10000)


class CommitmentReference(StrictModel):
    id: str
    description: str = Field(min_length=10, max_length=8000)


class AssessmentRequest(StrictModel):
    pactId: str = Field(min_length=1, max_length=100)
    commitment: str | None = Field(default=None, min_length=20, max_length=4000)
    commitments: list[CommitmentReference] = Field(default_factory=list, max_length=20)
    unavailableEvidence: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def valid_input(self):
        if not self.commitment and not self.commitments:
            raise ValueError("Commitments are required")
        if len({c.id for c in self.commitments}) != len(self.commitments):
            raise ValueError("Duplicate commitments")
        if len({e.id for e in self.evidence}) != len(self.evidence):
            raise ValueError("Duplicate evidence")
        if sum(len(e.content) for e in self.evidence) > 150000:
            raise ValueError("Evidence context exceeds budget")
        return self

    evidence: list[EvidenceReference] = Field(max_length=50)
