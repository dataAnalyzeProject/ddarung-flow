FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir "psycopg[binary]==3.2.10"

COPY pipeline /app/pipeline

CMD ["python", "-m", "pipeline.src.inventory_current_refresher"]
