import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from pact_ai.providers import NvidiaNimProvider, ProviderUnavailable, validated_assessment
from pact_ai.schemas import AssessmentRequest

app = FastAPI(title="Pact evidence service", version="0.1.0", docs_url="/docs")
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.getenv("AI_ALLOWED_HOSTS", "localhost,127.0.0.1,ai,testserver").split(","),
)


@app.get("/health")
def health():
    return {"data": {"service": "pact-ai", "status": "ok", "phase": 1}}


@app.get("/v1/providers")
def providers():
    return {"data": {"primary": "nvidia-nim", "fallback": "openai", "enabled": False}}


@app.post("/v1/assessments")
async def assess(request: AssessmentRequest):
    try:
        result = await validated_assessment(NvidiaNimProvider(), request)
        return {"data": result.model_dump(exclude_none=True)}
    except ProviderUnavailable:
        raise HTTPException(status_code=501, detail="Reasoning is not enabled in this foundation.")
