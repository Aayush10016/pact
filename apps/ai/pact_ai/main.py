import asyncio
import json
import os
import secrets
import sys

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from pact_ai.providers import NvidiaNimProvider, ProviderUnavailable, validated_assessment
from pact_ai.schemas import AssessmentRequest

app = FastAPI(title="Pact evidence service", version="0.2.0", docs_url="/docs")
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.getenv("AI_ALLOWED_HOSTS", "localhost,127.0.0.1,ai,testserver").split(","),
)


def service_identity(x_pact_service_key: str = Header(default="")):
    configured = os.getenv("AI_SERVICE_KEY")
    if not configured or not secrets.compare_digest(x_pact_service_key, configured):
        raise HTTPException(status_code=403, detail="Verified service identity required")


@app.get("/health")
def health():
    return {"data": {"service": "pact-ai", "status": "ok", "phase": 2}}


@app.get("/v1/providers")
def providers():
    return {
        "data": {
            "primary": "nvidia-nim",
            "fallback": "disabled",
            "enabled": bool(os.getenv("NVIDIA_NIM_API_KEY") and os.getenv("NVIDIA_NIM_MODEL")),
        }
    }


@app.post("/v1/assessments", dependencies=[Depends(service_identity)])
async def assess(request: AssessmentRequest):
    try:
        result = await validated_assessment(NvidiaNimProvider(), request)
        return {
            "data": result.model_dump(exclude_none=True),
            "model": os.getenv("NVIDIA_NIM_MODEL"),
        }
    except ProviderUnavailable:
        raise HTTPException(
            status_code=503, detail="Advisory provider unavailable; your Pact remains available"
        )
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Provider output failed validation")


@app.post("/v1/extract", dependencies=[Depends(service_identity)])
async def extract(request: Request):
    mime = request.headers.get("content-type", "")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Evidence size limit exceeded")
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "pact_ai.extractor",
        mime,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        output, _ = await asyncio.wait_for(process.communicate(bytes(data)), timeout=12)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise HTTPException(status_code=422, detail="Extraction exceeded safety budget")
    if process.returncode != 0:
        raise HTTPException(
            status_code=422,
            detail="Content extraction unavailable; upload text evidence for assessment",
        )
    return {"data": json.loads(output)}
