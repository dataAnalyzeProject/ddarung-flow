from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from pipeline.src.oci_historical_upload import partition_curated, upload_plan


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
