FROM python:3.11.14-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
COPY requirements*.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 180 --retries 5 -r requirements.lock.txt && useradd --create-home pact
COPY pact_ai ./pact_ai
USER pact
CMD ["uvicorn", "pact_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
