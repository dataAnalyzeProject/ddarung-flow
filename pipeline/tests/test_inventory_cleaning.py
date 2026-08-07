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
    find_actual_csv_file,
    load_and_verify_manifest,
)


def test_manifest_loading_and_2023_rejection():
    with tempfile.TemporaryDirectory() as temp_dir:
        manifest_path = pathlib.Path(temp_dir) / "approved_inventory_manifest.csv"
        manifest_path.write_text(
            "relative_path,sha256,approved,status,year\n"
            "data_2401.csv,ABC,true,RECOMMENDED,2024\n"
            "data_2301.csv,DEF,true,RECOMMENDED,2023\n",
            encoding="utf-8-sig",
        )
        manifest = load_and_verify_manifest(str(manifest_path))
        assert len(manifest) == 1
        assert manifest["file_path"].iloc[0] == "data_2401.csv"


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
            "file_path,sha256,approved,file_policy,year\n"
            f"{fixture_path.name},{file_sha},true,RECOMMENDED,2024\n",
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
        assert (curated["bike_count"] == 0).sum() == 1
        assert len(quarantine) == 2
        assert set(quarantine["bike_count"]) == {2, 3}
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
