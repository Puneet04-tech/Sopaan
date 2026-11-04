# Optional sidecar. Build context is the repository root so packs/ and trust.json travel with it.
FROM python:3.11-slim
WORKDIR /app
RUN useradd --system --uid 10002 sopaan
COPY ai/requirements.txt /app/ai/requirements.txt
RUN pip install --no-cache-dir -r /app/ai/requirements.txt
COPY ai /app/ai
COPY packs /app/packs
COPY tools/dev-keys.json /app/tools/dev-keys.json
USER sopaan
EXPOSE 8000
CMD ["uvicorn", "service:app", "--app-dir", "/app/ai", "--host", "0.0.0.0", "--port", "8000"]
