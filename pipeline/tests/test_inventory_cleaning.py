import hashlib
import os
import pathlib
import sys
import tempfile

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from pipeline.src.inventory_cleaning import (  # noqa: E402
    calculate_sha256,
    clean_inventory_dataset,
    curate_live_inventory_rows,
    find_actual_csv_file,
    load_and_verify_manifest,
)


def _live_inventory_row(bike_count="0"):
    return {
        "stationId": "ST-1",
        "stationName": "테스트 대여소",
        "parkingBikeTotCnt": bike_count,
        "rackTotCnt": "10",
        "stationLatitude": "37.5",
        "stationLongitude": "127.0",
    }


def test_live_inventory_keeps_zero_and_collapses_exact_duplicate():
    base = _live_inventory_row()
    curated, quarantine = curate_live_inventory_rows(
        [base, dict(base)],
        observed_at="2026-08-08T10:00:00+09:00",
        collected_at="2026-08-08T10:01:00+09:00",
    )

    assert len(curated) == 1
    assert curated[0]["bike_count"] == 0
    assert curated[0]["observed_at"] == "2026-08-08T01:00:00Z"
    assert curated[0]["collected_at"] == "2026-08-08T01:01:00Z"
    assert quarantine == []


def test_live_inventory_quarantines_conflicting_count():
    base = _live_inventory_row()
    curated, quarantine = curate_live_inventory_rows(
        [base, {**base, "parkingBikeTotCnt": "2"}],
        observed_at="2026-08-08T10:00:00+09:00",
        collected_at="2026-08-08T10:01:00+09:00",
    )

    assert curated == []
    assert len(quarantine) == 2
    assert {row["quarantine_reason"] for row in quarantine} == {
        "conflicting_bike_count"
    }


def test_live_inventory_is_independent_of_input_order():
    first = _live_inventory_row("2")
    second = {**_live_inventory_row("4"), "stationId": "ST-2"}
    arguments = {
        "observed_at": "2026-08-08T10:00:00+09:00",
        "collected_at": "2026-08-08T10:01:00+09:00",
    }

    forward = curate_live_inventory_rows([first, second], **arguments)
    reverse = curate_live_inventory_rows([second, first], **arguments)

    assert forward == reverse


def test_manifest_loading_and_2023_rejection():
    with tempfile.TemporaryDirectory() as temp_dir:
        manifest_path = pathlib.Path(temp_dir) / "approved_inventory_manifest.csv"
        manifest_path.write_text(
            "relative_path,sha256,period_start,period_end,approved,status,year\n"
            + "data_2401.csv," + "A" * 64
            + ",2024-01-01T00:00:00+09:00,2024-01-31T23:00:00+09:00,"
            + "true,use_as_is_after_standard_validation,2024\n",
            encoding="utf-8-sig",
        )
        manifest = load_and_verify_manifest(str(manifest_path))
        assert len(manifest) == 1
        assert manifest["file_path"].iloc[0] == "data_2401.csv"
        assert manifest["canonical_file_policy"].iloc[0] == "INCLUDE"


def test_manifest_rejects_missing_contract_columns_and_2023():
    with tempfile.TemporaryDirectory() as temp_dir:
        manifest_path = pathlib.Path(temp_dir) / "approved_inventory_manifest.csv"
        manifest_path.write_text(
            "file_path,sha256,approved,file_policy,year\n"
            + "data_2401.csv," + "A" * 64 + ",true,INCLUDE,2024\n",
            encoding="utf-8-sig",
        )
        try:
            load_and_verify_manifest(str(manifest_path))
            raise AssertionError("missing period columns must be rejected")
        except ValueError as error:
            assert "period_start" in str(error)

        manifest_path.write_text(
            "file_path,sha256,period_start,period_end,approved,file_policy,year\n"
            + "data_2301.csv," + "A" * 64
            + ",2023-01-01T00:00:00+09:00,2023-01-31T23:00:00+09:00,"
            + "true,INCLUDE,2023\n",
            encoding="utf-8-sig",
        )
        try:
            load_and_verify_manifest(str(manifest_path))
            raise AssertionError("2023 must be rejected")
        except ValueError as error:
            assert "2023" in str(error)


def test_find_actual_csv_file_requires_one_match():
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = pathlib.Path(temp_dir) / "2024"
        data_dir.mkdir()
        sample_file = data_dir / "data_2401.csv"
        sample_file.write_text("sample", encoding="utf-8")
        assert find_actual_csv_file(temp_dir, "data_2401.csv", year=2024) == str(
            sample_file
        )


def test_streaming_cleaning_zero_missing_duplicate_and_conflict():
    fixture_path = pathlib.Path(__file__).parent / "fixtures" / "inventory_sample.csv"
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = pathlib.Path(temp_dir)
        data_dir = temp_path / "2024"
        data_dir.mkdir()
        copied_fixture = data_dir / fixture_path.name
        copied_fixture.write_bytes(fixture_path.read_bytes())
        file_sha = calculate_sha256(copied_fixture)
        manifest_path = temp_path / "approved_inventory_manifest.csv"
        manifest_path.write_text(
            "file_path,sha256,period_start,period_end,approved,file_policy,year\n"
            f"{fixture_path.name},{file_sha},2024-01-01T00:00:00+09:00,"
            "2024-01-31T23:00:00+09:00,true,INCLUDE,2024\n",
            encoding="utf-8-sig",
        )
        output_dir = temp_path / "output"

        curated_path, quarantine_path, reconciliation = clean_inventory_dataset(
            manifest_path=str(manifest_path),
            data_root=str(temp_path),
            output_dir=str(output_dir),
            expected_manifest_sha=None,
        )

        curated = pd.read_csv(curated_path)
        quarantine = pd.read_csv(quarantine_path)
        assert list(curated.columns) == ["station_id", "observed_at", "bike_count"]
        assert len(curated) == 3
        assert curated["observed_at"].str.endswith("Z").all()
        assert "2024-01-01T01:00:00Z" in set(curated["observed_at"])
        assert (curated["bike_count"] == 0).sum() == 1
        assert len(quarantine) == 4
        assert set(quarantine["bike_count"].dropna()) == {-1, 2, 3}
        assert set(quarantine["quarantine_reason"]) == {
            "conflicting_station_time_key",
            "invalid_required_value",
        }
        assert reconciliation.loc[0, "missing_count"] == 1
        assert reconciliation.loc[0, "duplicate_removed"] == 1


def test_calculate_sha256_matches_hashlib():
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        temp_file.write(b"DATA-2.1")
        temp_path = temp_file.name
    try:
        assert calculate_sha256(temp_path) == hashlib.sha256(b"DATA-2.1").hexdigest().upper()
    finally:
        os.remove(temp_path)
