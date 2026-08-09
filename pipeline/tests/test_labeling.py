import json
import hashlib
import os
import pathlib
import sys
import tempfile

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from pipeline.src.labeling import (  # noqa: E402
    generate_h1_h4_labels,
    run_labeling_pipeline,
)


def test_h1_h4_exact_labeling():
    records = [
        {"station_id": "ST001", "observed_at": "2024-01-01 10:00:00", "bike_count": 3},
        {"station_id": "ST001", "observed_at": "2024-01-01 11:00:00", "bike_count": 4},
        {"station_id": "ST001", "observed_at": "2024-01-01 12:00:00", "bike_count": 0},
        {"station_id": "ST001", "observed_at": "2024-01-01 14:00:00", "bike_count": 5},
    ]
    labeled = generate_h1_h4_labels(pd.DataFrame(records))
    row = labeled[
        labeled["feature_as_of"] == pd.Timestamp("2024-01-01 10:00:00Z")
    ].iloc[0]
    assert bool(row["target_valid_h1"])
    assert row["future_bike_count_h1"] == 4
    assert row["label_h1_t1"] == 1
    assert bool(row["target_valid_h2"])
    assert row["future_bike_count_h2"] == 0
    assert row["label_h2_t1"] == 0
    assert not bool(row["target_valid_h3"])
    assert pd.isna(row["label_h3_t1"])
    assert bool(row["target_valid_h4"])
    assert row["future_bike_count_h4"] == 5


def test_duckdb_labeling_blocks_each_horizon_at_holdout_boundary():
    timestamps = pd.date_range(
        "2025-05-14 18:00:00", periods=12, freq="h", tz="Asia/Seoul"
    ).tz_convert("UTC")
    curated = pd.DataFrame(
        {
            "station_id": ["ST001"] * len(timestamps),
            "observed_at": timestamps,
            "bike_count": list(range(len(timestamps))),
        }
    )
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = pathlib.Path(temp_dir)
        curated_path = temp_path / "curated.csv"
        config_path = temp_path / "split.json"
        output_dir = temp_path / "output"
        curated.to_csv(curated_path, index=False)
        config_path.write_text(
            json.dumps(
                {
                    "train_range": {
                        "start_timestamp": "2025-05-14 00:00:00",
                        "end_timestamp": "2025-05-14 23:00:00",
                    },
                    "holdout_test_range": {
                        "start_timestamp": "2025-05-15 00:00:00",
                        "end_timestamp": "2025-12-31 23:00:00",
                    },
                }
            ),
            encoding="utf-8",
        )
        labeled_path, summary = run_labeling_pipeline(
            curated_csv_path=str(curated_path),
            output_dir=str(output_dir),
            config_path=str(config_path),
            memory_limit="256MB",
        )
        labeled = pd.read_csv(labeled_path, parse_dates=["feature_as_of"])
        assert labeled["feature_as_of"].dt.tz is not None
        first_data_row = pathlib.Path(labeled_path).read_text(
            encoding="utf-8"
        ).splitlines()[1]
        assert first_data_row.split(",")[1].endswith("Z")
        first_hash = hashlib.sha256(pathlib.Path(labeled_path).read_bytes()).hexdigest()

        row_20 = labeled[
            labeled["feature_as_of"] == pd.Timestamp("2025-05-14 11:00:00Z")
        ].iloc[0]
        assert bool(row_20["target_valid_h1"])
        assert bool(row_20["target_valid_h2"])
        assert bool(row_20["target_valid_h3"])
        assert not bool(row_20["target_valid_h4"])

        row_21 = labeled[
            labeled["feature_as_of"] == pd.Timestamp("2025-05-14 12:00:00Z")
        ].iloc[0]
        assert bool(row_21["target_valid_h1"])
        assert bool(row_21["target_valid_h2"])
        assert not bool(row_21["target_valid_h3"])

        row_22 = labeled[
            labeled["feature_as_of"] == pd.Timestamp("2025-05-14 13:00:00Z")
        ].iloc[0]
        assert bool(row_22["target_valid_h1"])
        assert not bool(row_22["target_valid_h2"])

        row_23 = labeled[
            labeled["feature_as_of"] == pd.Timestamp("2025-05-14 14:00:00Z")
        ].iloc[0]
        assert all(not bool(row_23[f"target_valid_h{horizon}"]) for horizon in (1, 2, 3, 4))
        assert len(summary) == 4

        rerun_path, _ = run_labeling_pipeline(
            curated_csv_path=str(curated_path),
            output_dir=str(output_dir),
            config_path=str(config_path),
            memory_limit="256MB",
        )
        assert hashlib.sha256(pathlib.Path(rerun_path).read_bytes()).hexdigest() == first_hash
