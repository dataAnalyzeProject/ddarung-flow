import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.prediction_batch_publisher import PUBLISH_TTL, publish_prediction_batch
from pipeline.src.publish_prediction_batch import main, publish_batch_file


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "batch_inference_sample.json"


class FakeCursor:
    def __init__(self):
        self.calls = []
        self.closed = False

    def execute(self, statement, parameters):
        self.calls.append((statement, parameters))

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self):
        self.cursor_value = FakeCursor()
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return self.cursor_value

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def valid_batch_result():
    inputs = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return run_batch_inference(
        inputs,
        predictor=lambda rows: [0.95 - row["required_bike_count"] * 0.08 for row in rows],
        generated_at="2026-08-15T10:00:00Z",
    )


def test_publisher_upserts_one_active_batch_and_one_row_per_station_horizon():
    connection = FakeConnection()

    result = publish_prediction_batch(connection, valid_batch_result())

    assert connection.commits == 1
    assert connection.rollbacks == 0
    assert connection.cursor_value.closed is True
    assert len(connection.cursor_value.calls) == 9  # one batch + two stations x four horizons
    batch_parameters = connection.cursor_value.calls[0][1]
    assert batch_parameters[4] == batch_parameters[3]  # publishedAt == generatedAt
    assert batch_parameters[5] - batch_parameters[2] == PUBLISH_TTL
    first_prediction_parameters = connection.cursor_value.calls[1][1]
    assert first_prediction_parameters[4:9] == pytest.approx((0.87, 0.79, 0.71, 0.63, 0.55))
    assert result["publishedStationPredictions"] == 8


def test_publisher_rejects_invalid_batch_without_touching_database():
    connection = FakeConnection()
    batch_result = valid_batch_result()
    batch_result["publishable"] = False

    with pytest.raises(ValueError, match="publishable"):
        publish_prediction_batch(connection, batch_result)

    assert connection.cursor_value.calls == []
    assert connection.commits == 0


def test_manual_publish_entry_point_loads_a_validated_batch_file(tmp_path):
    batch_file = tmp_path / "batch-result.json"
    batch_file.write_text(json.dumps(valid_batch_result()), encoding="utf-8")
    connection = FakeConnection()

    result = publish_batch_file(batch_file, "postgresql://unused", lambda _: connection)

    assert result["publishedStationPredictions"] == 8
    assert connection.commits == 1
    assert connection.closed is True


def test_manual_publish_cli_uses_database_url_without_printing_it(tmp_path, monkeypatch, capsys):
    batch_file = tmp_path / "batch-result.json"
    batch_file.write_text(json.dumps(valid_batch_result()), encoding="utf-8")
    connection = FakeConnection()
    monkeypatch.setenv("DATABASE_URL", "postgresql://publisher:secret@db/predictions")
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(connect=lambda _: connection))

    assert main(["--batch-result", str(batch_file)]) == 0

    assert connection.commits == 1
    assert "secret" not in capsys.readouterr().out
