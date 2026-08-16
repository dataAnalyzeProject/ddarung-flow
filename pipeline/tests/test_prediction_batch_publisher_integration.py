import json
import os
from pathlib import Path
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.prediction_batch_publisher import publish_prediction_batch


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "batch_inference_sample.json"


def valid_batch_result():
    inputs = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return run_batch_inference(
        inputs,
        predictor=lambda rows: [0.95 - row["required_bike_count"] * 0.08 for row in rows],
        generated_at="2026-08-15T10:00:00Z",
    )


@pytest.fixture
def publisher_database():
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")

    connection = psycopg.connect(database_url)
    schema = f"publisher_it_{uuid4().hex}"
    with connection.cursor() as cursor:
        cursor.execute(f'CREATE SCHEMA "{schema}"')
        cursor.execute(f'SET search_path TO "{schema}"')
        cursor.execute(
            """
            CREATE TABLE prediction_batches (
                batch_id UUID PRIMARY KEY,
                model_version VARCHAR(100) NOT NULL,
                feature_as_of TIMESTAMPTZ NOT NULL,
                generated_at TIMESTAMPTZ NOT NULL,
                publish_status VARCHAR(20) NOT NULL,
                published_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ NOT NULL,
                pipeline_run_id VARCHAR(255),
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE station_predictions (
                id BIGSERIAL PRIMARY KEY,
                batch_id UUID NOT NULL REFERENCES prediction_batches(batch_id),
                station_id VARCHAR(50) NOT NULL,
                prediction_target_at TIMESTAMPTZ NOT NULL,
                horizon_minutes INTEGER NOT NULL,
                at_least_1_probability NUMERIC(8, 7) NOT NULL,
                at_least_2_probability NUMERIC(8, 7) NOT NULL,
                at_least_3_probability NUMERIC(8, 7) NOT NULL,
                at_least_4_probability NUMERIC(8, 7) NOT NULL,
                at_least_5_probability NUMERIC(8, 7) NOT NULL,
                prediction_status VARCHAR(20) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT uk_station_predictions_batch_station_target
                    UNIQUE (batch_id, station_id, prediction_target_at)
            )
            """
        )
    connection.commit()

    try:
        yield connection
    finally:
        connection.rollback()
        with connection.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        connection.commit()
        connection.close()


def test_publisher_inserts_and_idempotently_upserts_real_postgres_rows(publisher_database):
    batch = valid_batch_result()

    first = publish_prediction_batch(publisher_database, batch)
    second = publish_prediction_batch(publisher_database, batch)

    assert first["batchId"] == second["batchId"]
    with publisher_database.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM prediction_batches")
        assert cursor.fetchone()[0] == 1
        cursor.execute("SELECT COUNT(*) FROM station_predictions")
        assert cursor.fetchone()[0] == 8
