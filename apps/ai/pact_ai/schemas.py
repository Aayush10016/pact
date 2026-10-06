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


class Assessment(StrictModel):
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
    id: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=10000)


class AssessmentRequest(StrictModel):
    pactId: str = Field(min_length=1, max_length=100)
    commitment: str = Field(min_length=20, max_length=4000)
    evidence: list[EvidenceReference] = Field(max_length=50)
