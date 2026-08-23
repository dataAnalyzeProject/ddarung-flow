"""PREDICT-OPS-MVP-03: OCI artifact/curated-snapshot glue script tests.

Uses fakes for the OCI object-storage client (no live OCI access), following the
FakeClient/Response pattern already used by pipeline/tests/test_oci_model_artifact_upload.py.
"""

import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace

import joblib
import pandas as pd
import pytest

from infra.inference.app import EXPECTED_FEATURE_NAMES
from pipeline.src import oci_batch_inference_run as run_module


POINTER_SUPPORT = {
    "horizon_minutes": [60, 120, 180, 240],
    "required_bike_counts": [1, 2, 3, 4, 5],
    "combination_count": 20,
}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Response:
    """Mimics an OCI SDK get_object response: .data.raw.stream(...)."""

    def __init__(self, body: bytes):
        self.data = SimpleNamespace(raw=SimpleNamespace(stream=lambda *args, **kwargs: [body]))


class ListResponse:
    def __init__(self, names, next_start_with=None):
        self.data = SimpleNamespace(
            objects=[SimpleNamespace(name=name) for name in names],
            next_start_with=next_start_with,
        )


class FakeObjectStorageClient:
    def __init__(self, objects: dict[str, bytes], list_pages=None):
        self.objects = objects
        self._list_pages = list_pages or []
        self.list_calls = []

    def get_namespace(self):
        return SimpleNamespace(data="test-namespace")

    def get_object(self, namespace, bucket, key):
        return Response(self.objects[key])

    def list_objects(self, namespace, bucket, prefix=None, start=None, fields=None):
        self.list_calls.append(start)
        index = 0 if start is None else int(start)
        names, next_start = self._list_pages[index]
        return ListResponse(names, next_start_with=next_start)


class FakeModel:
    """Module-level (not a local/nested class) so joblib/pickle can serialize it
    for the load_verified_model / main() round-trip tests."""

    classes_ = [0, 1, 2, 3, 4, 5]
    received_rows: list = []

    def predict_proba(self, rows):
        # One fixed, valid 6-class distribution per row, regardless of input --
        # enough to exercise the tail-sum/grouping wiring deterministically.
        FakeModel.received_rows = list(rows)
        return [[0.10, 0.15, 0.20, 0.20, 0.15, 0.20] for _ in rows]


def _build_model_bundle():
    return {
        "model": FakeModel(),
        "model_name": "hist_gradient_boosting_inventory_distribution",
        "bucket_definition": "0,1,2,3,4,5+",
        "feature_columns": list(EXPECTED_FEATURE_NAMES),
    }


def _joblib_bytes(obj) -> bytes:
    buffer = io.BytesIO()
    joblib.dump(obj, buffer)
    return buffer.getvalue()


def _pointer_manifest_artifact_objects():
    artifact_bytes = _joblib_bytes(_build_model_bundle())
    artifact_sha256 = _sha256(artifact_bytes)

    manifest = {
        "artifact_sha256": artifact_sha256,
        "horizon_minutes": POINTER_SUPPORT["horizon_minutes"],
        "required_bike_counts": POINTER_SUPPORT["required_bike_counts"],
        "combination_metrics": [
            {"horizon_minutes": h, "required_bike_count": q}
            for h in POINTER_SUPPORT["horizon_minutes"]
            for q in POINTER_SUPPORT["required_bike_counts"]
        ],
    }
    manifest_bytes = json.dumps(manifest).encode("utf-8")
    manifest_sha256 = _sha256(manifest_bytes)

    pointer = {
        "schema_version": 1,
        "state": "INACTIVE",
        "model_version": "hist_gradient_boosting@test",
        "artifact": {"key": "models/test/artifact.joblib", "sha256": artifact_sha256},
        "manifest": {"key": "models/test/manifest.json", "sha256": manifest_sha256},
        "support": POINTER_SUPPORT,
    }
    pointer_bytes = json.dumps(pointer).encode("utf-8")
    pointer_sha256 = _sha256(pointer_bytes)

    objects = {
        "models/test/pointer.json": pointer_bytes,
        "models/test/manifest.json": manifest_bytes,
        "models/test/artifact.joblib": artifact_bytes,
    }
    return objects, pointer_sha256


def _curated_frame_bytes(rows):
    frame = pd.DataFrame(rows, columns=run_module.CURATED_SNAPSHOT_COLUMNS)
    buffer = io.BytesIO()
    frame.to_parquet(buffer, index=False)
    return buffer.getvalue()


CURATED_ROWS = [
    {
        "station_id": "ST-1",
        "station_name": "역1",
        "observed_at": "2026-08-23T02:00:00+00:00",
        "bike_count": 5,
        "rack_count": 10,
        "latitude": 37.5,
        "longitude": 127.0,
        "collected_at": "2026-08-23T02:00:03+00:00",
    },
    {
        "station_id": "ST-2",
        "station_name": "역2",
        "observed_at": "2026-08-23T02:00:00+00:00",
        "bike_count": 0,
        "rack_count": 8,
        "latitude": 37.6,
        "longitude": 127.1,
        "collected_at": "2026-08-23T02:00:03+00:00",
    },
    {
        "station_id": "ST-3",
        "station_name": "역3 (결측)",
        "observed_at": "2026-08-23T02:00:00+00:00",
        "bike_count": None,
        "rack_count": 12,
        "latitude": 37.7,
        "longitude": 127.2,
        "collected_at": "2026-08-23T02:00:03+00:00",
    },
]


class TestFindLatestCuratedSnapshotKey:
    def test_picks_lexicographically_latest_across_pages(self):
        client = FakeObjectStorageClient(
            objects={},
            list_pages=[
                (["curated/year=2026/month=08/day=20/observed_020000.parquet"], "1"),
                (["curated/year=2026/month=08/day=23/observed_020000.parquet"], None),
            ],
        )
        latest = run_module.find_latest_curated_snapshot_key(client, "ns", "bucket")
        assert latest == "curated/year=2026/month=08/day=23/observed_020000.parquet"

    def test_raises_when_no_snapshot_found(self):
        client = FakeObjectStorageClient(objects={}, list_pages=[([], None)])
        with pytest.raises(RuntimeError, match="no curated snapshot"):
            run_module.find_latest_curated_snapshot_key(client, "ns", "bucket")


class TestLoadCuratedSnapshot:
    def test_reads_parquet_and_checks_columns(self):
        body = _curated_frame_bytes(CURATED_ROWS)
        client = FakeObjectStorageClient(objects={"curated/x.parquet": body})
        frame = run_module.load_curated_snapshot(client, "ns", "bucket", "curated/x.parquet")
        assert list(frame["station_id"]) == ["ST-1", "ST-2", "ST-3"]

    def test_raises_on_missing_columns(self):
        frame = pd.DataFrame([{"station_id": "ST-1"}])
        buffer = io.BytesIO()
        frame.to_parquet(buffer, index=False)
        client = FakeObjectStorageClient(objects={"curated/x.parquet": buffer.getvalue()})
        with pytest.raises(RuntimeError, match="missing columns"):
            run_module.load_curated_snapshot(client, "ns", "bucket", "curated/x.parquet")


STATION_NUMBER_BY_ID = {"ST-1": 108, "ST-2": 205}


class TestLoadStationNumberMapping:
    def test_reads_csv_and_coerces_numbers(self, tmp_path):
        csv_path = tmp_path / "mapping.csv"
        csv_path.write_text("station_id,station_number\nST-1,108\nST-2,205\n", encoding="utf-8")

        mapping = run_module.load_station_number_mapping(csv_path)

        assert mapping == {"ST-1": 108, "ST-2": 205}

    def test_raises_on_empty_file(self, tmp_path):
        csv_path = tmp_path / "mapping.csv"
        csv_path.write_text("station_id,station_number\n", encoding="utf-8")

        with pytest.raises(RuntimeError, match="no usable rows"):
            run_module.load_station_number_mapping(csv_path)


class TestBuildStationInputs:
    def test_skips_null_bike_count_and_unmapped_stations(self):
        # ST-1/ST-2 are in STATION_NUMBER_BY_ID; ST-3 has a null bike_count (already
        # excluded) and would also be unmapped, covering both skip reasons at once.
        frame = pd.DataFrame(CURATED_ROWS, columns=run_module.CURATED_SNAPSHOT_COLUMNS)
        inputs = run_module.build_station_inputs(frame, "model-v1", "manifest-hash", STATION_NUMBER_BY_ID)

        assert [row["stationId"] for row in inputs] == ["ST-1", "ST-2"]
        assert inputs[0]["currentBikeCount"] == 5
        assert inputs[0]["modelVersion"] == "model-v1"
        assert inputs[0]["inputManifestHash"] == "manifest-hash"
        assert inputs[0]["featureAsOf"] == "2026-08-23T02:00:00+00:00"

    def test_skips_stations_missing_from_mapping(self):
        frame = pd.DataFrame(
            [{**CURATED_ROWS[0], "station_id": "ST-UNKNOWN"}], columns=run_module.CURATED_SNAPSHOT_COLUMNS
        )
        inputs = run_module.build_station_inputs(frame, "model-v1", "manifest-hash", STATION_NUMBER_BY_ID)

        assert inputs == []


class TestMakePredictor:
    def test_groups_by_five_translates_station_number_and_computes_tail_sums(self):
        predictor = run_module.make_predictor(_build_model_bundle(), STATION_NUMBER_BY_ID)
        one_station_horizon_group = [
            {
                "station_id": "ST-1",
                "day_of_week": 0,
                "hour_of_day": 9,
                "month": 8,
                "is_weekend": 0,
                "current_bike_count": 5,
                "horizon_minutes": 60,
                "required_bike_count": quantity,
            }
            for quantity in run_module.SUPPORTED_QUANTITIES
        ]

        result = predictor(one_station_horizon_group)

        # FakeModel always returns buckets [0.10,0.15,0.20,0.20,0.15,0.20] for classes 0..5.
        # tail(q) = sum(buckets[q:6]) for q in 1..5 -> [1.0-0.10, ... ] and must be
        # non-increasing (monotonicity is enforced as a safety net regardless).
        assert len(result) == 5
        assert all(0.0 <= value <= 1.0 for value in result)
        assert result == sorted(result, reverse=True)
        # The model must see the numeric station_number (108), never the raw "ST-1".
        assert FakeModel.received_rows == [(108, 0, 9, 8, 0, 5, 60)]

    def test_rejects_incomplete_groups(self):
        predictor = run_module.make_predictor(_build_model_bundle(), STATION_NUMBER_BY_ID)
        with pytest.raises(ValueError, match="groups of 5"):
            predictor([{"station_id": "ST-1"}] * 3)


class TestLoadVerifiedModel:
    def test_verifies_full_pointer_manifest_artifact_chain(self):
        objects, pointer_sha256 = _pointer_manifest_artifact_objects()
        client = FakeObjectStorageClient(objects=objects)

        bundle, pointer, manifest = run_module.load_verified_model(
            client, "ns", "bucket", "models/test/pointer.json", pointer_sha256
        )

        assert bundle["model_name"] == "hist_gradient_boosting_inventory_distribution"
        assert pointer["model_version"] == "hist_gradient_boosting@test"
        assert manifest["artifact_sha256"] == pointer["artifact"]["sha256"]

    def test_rejects_pointer_checksum_mismatch(self):
        objects, _correct_sha256 = _pointer_manifest_artifact_objects()
        client = FakeObjectStorageClient(objects=objects)

        with pytest.raises(RuntimeError, match="checksum"):
            run_module.load_verified_model(client, "ns", "bucket", "models/test/pointer.json", "0" * 64)


class TestMainEndToEnd:
    def test_writes_publishable_result_file(self, tmp_path, monkeypatch):
        objects, pointer_sha256 = _pointer_manifest_artifact_objects()
        objects["curated/x.parquet"] = _curated_frame_bytes(CURATED_ROWS)
        client = FakeObjectStorageClient(objects=objects, list_pages=[(["curated/x.parquet"], None)])
        monkeypatch.setattr(run_module, "create_object_storage_client", lambda: client)

        mapping_csv = tmp_path / "mapping.csv"
        mapping_csv.write_text("station_id,station_number\nST-1,108\nST-2,205\n", encoding="utf-8")

        result_file = tmp_path / "batch-result.json"
        exit_code = run_module.main(
            [
                "--artifact-pointer",
                "models/test/pointer.json",
                "--artifact-pointer-sha256",
                pointer_sha256,
                "--bucket",
                "test-bucket",
                "--station-mapping-csv",
                str(mapping_csv),
                "--result-file",
                str(result_file),
            ]
        )

        assert exit_code == 0
        written = json.loads(result_file.read_text(encoding="utf-8"))
        assert written["publishable"] is True
        # 2 stations (ST-3 skipped for null bike_count) x 4 horizons x 5 quantities.
        assert written["rowCount"] == 2 * 4 * 5

    def test_skips_station_missing_from_mapping(self, tmp_path, monkeypatch):
        objects, pointer_sha256 = _pointer_manifest_artifact_objects()
        objects["curated/x.parquet"] = _curated_frame_bytes(CURATED_ROWS)
        client = FakeObjectStorageClient(objects=objects, list_pages=[(["curated/x.parquet"], None)])
        monkeypatch.setattr(run_module, "create_object_storage_client", lambda: client)

        # Only ST-1 is mapped; ST-2 (has a real bike_count) must be dropped, not guessed.
        mapping_csv = tmp_path / "mapping.csv"
        mapping_csv.write_text("station_id,station_number\nST-1,108\n", encoding="utf-8")

        result_file = tmp_path / "batch-result.json"
        exit_code = run_module.main(
            [
                "--artifact-pointer",
                "models/test/pointer.json",
                "--artifact-pointer-sha256",
                pointer_sha256,
                "--bucket",
                "test-bucket",
                "--station-mapping-csv",
                str(mapping_csv),
                "--result-file",
                str(result_file),
            ]
        )

        assert exit_code == 0
        written = json.loads(result_file.read_text(encoding="utf-8"))
        assert written["rowCount"] == 1 * 4 * 5
        assert {row["stationId"] for row in written["rows"]} == {"ST-1"}
