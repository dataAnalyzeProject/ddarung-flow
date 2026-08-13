from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from pipeline.src.inventory_cleaning import calculate_sha256
from pipeline.src.oci_historical_upload import (
    CURATED_LINEAGE_FILE,
    _masked_result,
    load_curated_plan,
    partition_curated,
    upload_plan,
    verify_remote_plan,
)


class PreconditionFailure(Exception):
    status = 412


class MissingObject(Exception):
    status = 404


class FakeUploadClient:
    def __init__(self, existing_sha=None, existing_size=None):
        self.existing_sha = existing_sha
        self.existing_size = existing_size
        self.options = None

    def get_namespace(self):
        return SimpleNamespace(data="test-namespace")

    def put_object(self, namespace, bucket, object_name, body, **kwargs):
        self.options = kwargs
        if self.existing_sha:
            raise PreconditionFailure()
        return SimpleNamespace(headers={"etag": "created-etag"})

    def head_object(self, namespace, bucket, object_name):
        if self.existing_sha is None:
            raise MissingObject()
        return SimpleNamespace(
            headers={
                "opc-meta-sha256": self.existing_sha,
                "content-length": str(self.existing_size),
                "etag": "existing-etag",
            }
        )


def test_partition_curated_is_year_keyed_and_repeatable(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {
            "station_id": ["1", "2", "3"],
            "observed_at": [
                "2021-12-31T15:00:00Z",
                "2024-01-01T00:00:00Z",
                "2022-01-01T01:00:00Z",
            ],
            "bike_count": [1, 2, 3],
        }
    ).to_csv(source, index=False)
    result = partition_curated(source, tmp_path / "parts", chunk_rows=2)
    assert [item["object_name"] for item in result] == [
        "curated/bike-inventory/historical/2022/part-00000.csv",
        "curated/bike-inventory/historical/2022/part-00001.csv",
        "curated/bike-inventory/historical/2024/part-00000.csv",
    ]
    assert all(item["sha256"] for item in result)


def test_partition_curated_keeps_years_separate(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {"station_id": ["1"], "observed_at": ["2025-01-01T00:00:00Z"], "bike_count": [1]}
    ).to_csv(source, index=False)
    result = partition_curated(source, tmp_path / "parts")
    assert result[0]["year"] == 2025
    assert Path(result[0]["source"]).parent.name == "2025"


def test_partition_curated_rejects_unapproved_year(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {"station_id": ["1"], "observed_at": ["2026-01-01T00:00:00Z"], "bike_count": [1]}
    ).to_csv(source, index=False)
    try:
        partition_curated(source, tmp_path / "parts")
    except ValueError as error:
        assert "outside approved scope" in str(error)
    else:
        raise AssertionError("unapproved year must be rejected")


@pytest.mark.parametrize("observed_at", [None, "not-a-timestamp"])
def test_partition_curated_rejects_invalid_or_null_timestamp(tmp_path, observed_at):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {"station_id": ["1"], "observed_at": [observed_at], "bike_count": [1]}
    ).to_csv(source, index=False)
    with pytest.raises(ValueError, match="invalid or null observed_at"):
        partition_curated(source, tmp_path / "parts")


def test_partition_curated_preserves_all_rows_and_writes_lineage(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {
            "station_id": ["1", "2"],
            "observed_at": ["2022-01-01T00:00:00Z", "2025-01-01T00:00:00Z"],
            "bike_count": [1, 2],
        }
    ).to_csv(source, index=False)
    source_sha = calculate_sha256(source)
    plan = partition_curated(
        source,
        tmp_path / "parts",
        expected_sha256=source_sha,
        expected_rows=2,
    )
    assert sum(item["row_count"] for item in plan) == 2
    assert (tmp_path / "parts" / CURATED_LINEAGE_FILE).is_file()


def test_load_curated_plan_rejects_missing_or_changed_partition(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {
            "station_id": ["1", "2"],
            "observed_at": ["2022-01-01T00:00:00Z", "2025-01-01T00:00:00Z"],
            "bike_count": [1, 2],
        }
    ).to_csv(source, index=False)
    source_sha = calculate_sha256(source)
    parts = tmp_path / "parts"
    plan = partition_curated(
        source, parts, expected_sha256=source_sha, expected_rows=2
    )
    assert len(load_curated_plan(source, parts, expected_sha256=source_sha, expected_rows=2)) == 2

    Path(plan[0]["source"]).write_text("changed\n", encoding="utf-8")
    with pytest.raises(ValueError, match="partition lineage mismatch"):
        load_curated_plan(source, parts, expected_sha256=source_sha, expected_rows=2)


def test_load_curated_plan_rejects_wrong_source_lineage(tmp_path):
    source = tmp_path / "curated.csv"
    pd.DataFrame(
        {"station_id": ["1"], "observed_at": ["2022-01-01T00:00:00Z"], "bike_count": [1]}
    ).to_csv(source, index=False)
    source_sha = calculate_sha256(source)
    parts = tmp_path / "parts"
    partition_curated(source, parts, expected_sha256=source_sha, expected_rows=1)
    source.write_text(
        "station_id,observed_at,bike_count\n2,2022-01-01T00:00:00Z,1\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="approved Curated checksum mismatch"):
        load_curated_plan(source, parts, expected_sha256=source_sha, expected_rows=1)


def test_upload_plan_uses_checksum_and_immutable_write(tmp_path):
    source = tmp_path / "part.csv"
    source.write_text("id\n1\n", encoding="utf-8")
    item = {
        "kind": "curated",
        "year": 2025,
        "source": str(source),
        "object_name": "curated/bike-inventory/historical/2025/part-00000.csv",
        "size_bytes": source.stat().st_size,
        "sha256": "A" * 64,
        "row_count": 1,
    }
    client = FakeUploadClient()
    result = upload_plan([item], "test-bucket", client)
    assert result[0]["created"] is True
    assert client.options["expect"] == "100-Continue"
    assert client.options["if_none_match"] == "*"
    assert client.options["opc_checksum_algorithm"] == "SHA256"
    assert client.options["opc_meta"]["sha256"] == "A" * 64


def test_upload_plan_reuses_only_matching_existing_object(tmp_path):
    source = tmp_path / "part.csv"
    source.write_text("id\n1\n", encoding="utf-8")
    item = {
        "kind": "curated",
        "year": 2025,
        "source": str(source),
        "object_name": "curated/bike-inventory/historical/2025/part-00000.csv",
        "size_bytes": source.stat().st_size,
        "sha256": "B" * 64,
        "row_count": 1,
    }
    matching = FakeUploadClient(item["sha256"], item["size_bytes"])
    assert upload_plan([item], "test-bucket", matching)[0]["created"] is False

    mismatching = FakeUploadClient("C" * 64, item["size_bytes"])
    with pytest.raises(ValueError, match="checksum differs"):
        upload_plan([item], "test-bucket", mismatching)


def test_upload_plan_large_file_uses_immutable_multipart(tmp_path):
    source = tmp_path / "large.csv"
    source.write_bytes(b"x")
    source_size = 32 * 1024 * 1024
    source.touch()
    with source.open("r+b") as stream:
        stream.truncate(source_size)
    item = {
        "kind": "curated",
        "year": 2025,
        "source": str(source),
        "object_name": "curated/bike-inventory/historical/2025/part-00000.csv",
        "size_bytes": source_size,
        "sha256": "D" * 64,
        "row_count": 1,
    }
    class MultipartClient(FakeUploadClient):
        def create_multipart_upload(self, namespace, bucket, details, **kwargs):
            self.create_options = kwargs
            return SimpleNamespace(data=SimpleNamespace(upload_id="upload-1"))

        def upload_part(self, *args, **kwargs):
            return SimpleNamespace(headers={"etag": "part-etag"})

        def commit_multipart_upload(self, *args, **kwargs):
            self.commit_options = kwargs
            return SimpleNamespace(headers={"etag": "multipart-etag"})

        def abort_multipart_upload(self, *args, **kwargs):
            raise AssertionError("successful upload must not abort")

    client = MultipartClient()
    result = upload_plan([item], "test-bucket", client)
    assert result[0]["created"] is True
    assert client.create_options["if_none_match"] == "*"
    assert client.commit_options["if_none_match"] == "*"


def test_multipart_commit_race_preserves_existing_object(tmp_path):
    source = tmp_path / "large.csv"
    with source.open("wb") as stream:
        stream.truncate(32 * 1024 * 1024)
    item = {
        "kind": "curated", "year": 2025, "source": str(source),
        "object_name": "curated/2025/part.csv", "size_bytes": source.stat().st_size,
        "sha256": "F" * 64, "row_count": 1,
    }

    class RacingClient(FakeUploadClient):
        def __init__(self):
            super().__init__()
            self.aborted = False

        def create_multipart_upload(self, *args, **kwargs):
            return SimpleNamespace(data=SimpleNamespace(upload_id="upload-race"))

        def upload_part(self, *args, **kwargs):
            return SimpleNamespace(headers={"etag": "part-etag"})

        def commit_multipart_upload(self, *args, **kwargs):
            assert kwargs["if_none_match"] == "*"
            self.existing_sha = item["sha256"]
            self.existing_size = item["size_bytes"]
            raise PreconditionFailure()

        def abort_multipart_upload(self, *args, **kwargs):
            self.aborted = True

    client = RacingClient()
    result = upload_plan([item], "test-bucket", client)
    assert result[0]["created"] is False
    assert result[0]["sha256"] == item["sha256"]
    assert result[0]["size_bytes"] == item["size_bytes"]
    assert client.aborted is True


def test_remote_verification_reports_metadata_scope_and_masks_object_keys(tmp_path):
    source = tmp_path / "part.csv"
    source.write_text("id\n1\n", encoding="utf-8")
    item = {
        "kind": "curated",
        "year": 2025,
        "source": str(source),
        "object_name": "private/prefix/part.csv",
        "size_bytes": source.stat().st_size,
        "sha256": "E" * 64,
        "row_count": 1,
    }
    client = FakeUploadClient(item["sha256"], item["size_bytes"])
    verification = verify_remote_plan([item], "test-bucket", client)
    assert verification == {
        "scope": "head_metadata_sha256_and_size",
        "verified_objects": 1,
        "status": "PASS",
    }
    masked = _masked_result([item], verification)
    assert masked["objects"][0]["object_alias"] == "curated:2025:001"
    assert "object_name" not in masked["objects"][0]
