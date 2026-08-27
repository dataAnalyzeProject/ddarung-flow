import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline.src.build_prediction_snapshot import build_snapshot_rows, main
from pipeline.src.batch_inference import run_batch_inference


FIXTURE = Path(__file__).parent / "fixtures" / "prediction_snapshot_inventory.json"
MANIFEST = {"model_version": "data-3.3-test", "artifact_sha256": "approved-artifact-hash"}


def rows():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_builds_exactly_the_required_inference_input_keys():
    snapshot = build_snapshot_rows(rows(), MANIFEST)

    assert [row["stationId"] for row in snapshot] == [101, 108]
    assert set(snapshot[0]) == {"stationId", "featureAsOf", "currentBikeCount", "modelVersion", "inputManifestHash"}
    assert snapshot[0]["featureAsOf"] == "2026-08-27T02:00:00Z"
    assert snapshot[0]["modelVersion"] == "data-3.3-test"
    assert snapshot[0]["inputManifestHash"] == "approved-artifact-hash"


def test_excludes_non_normal_inventory_rows():
    assert len(build_snapshot_rows(rows(), MANIFEST)) == 2


def test_invalid_station_number_identifies_the_internal_station_id():
    invalid = rows()
    invalid[0]["station_number"] = "not-a-number"
    with pytest.raises(ValueError, match="ST-2.*not-a-number"):
        build_snapshot_rows(invalid, MANIFEST)


def test_snapshot_uses_numeric_station_numbers_and_rejects_string_feature_input():
    snapshot = build_snapshot_rows(rows(), MANIFEST)
    assert all(isinstance(row["stationId"], int) for row in snapshot)
    bad = [{**snapshot[0], "stationId": "ST-10"}]
    result = run_batch_inference(bad, predictor=lambda features: [float(feature["station_id"]) for feature in features])
    assert result["publishable"] is False
    assert any("predictor_exception" in error for error in result["errors"])


def test_rejects_mixed_feature_as_of_values():
    mixed = rows()
    mixed[1]["collected_at"] = datetime(2026, 8, 27, 2, 10, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="share one collected_at"):
        build_snapshot_rows(mixed, MANIFEST)


def test_rejects_empty_normal_inventory_result():
    with pytest.raises(ValueError, match="no NORMAL"):
        build_snapshot_rows([rows()[-1]], MANIFEST)


def test_database_url_is_not_written_to_snapshot_or_output(tmp_path, monkeypatch, capsys):
    database_url = "postgresql://snapshot:secret@db/predictions"
    manifest_path = tmp_path / "manifest.json"
    output_path = tmp_path / "snapshot.json"
    manifest_path.write_text(json.dumps(MANIFEST), encoding="utf-8")

    class Cursor:
        description = [SimpleNamespace(name=name) for name in ("station_id", "station_number", "collected_at", "available_bike_count", "inventory_status")]
        def execute(self, statement): self.statement = statement
        def fetchall(self): return [("ST-1", "101", datetime(2026, 8, 27, 2, 0, tzinfo=timezone.utc), 1, "NORMAL")]
        def close(self): pass
    class Connection:
        def cursor(self): return Cursor()
        def close(self): pass

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(connect=lambda _: Connection()))
    assert main(["--manifest", str(manifest_path), "--output", str(output_path)]) == 0

    assert database_url not in output_path.read_text(encoding="utf-8")
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"stationCount": 1, "skippedCount": 0}
    assert database_url not in captured.out
    assert database_url not in captured.err
