FROM python:3.11.14-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt && useradd --create-home pact
COPY pact_ai ./pact_ai
USER pact
CMD ["uvicorn", "pact_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
