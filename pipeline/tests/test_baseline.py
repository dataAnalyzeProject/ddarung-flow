import os
import sys
import pathlib
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
import pandas as pd
from pipeline.src.baseline import (
    calculate_brier_score,
    calculate_deficit_recall,
    calculate_calibration_error,
    calculate_accuracy,
    run_baseline_pipeline,
)

def test_brier_score_calculation():
    y_true = np.array([1, 0, 1, 0])
    y_prob = np.array([0.9, 0.1, 0.8, 0.2])
    # squared errors: (0.1)^2 + (0.1)^2 + (0.2)^2 + (0.2)^2 = 0.01 + 0.01 + 0.04 + 0.04 = 0.10 / 4 = 0.025
    score = calculate_brier_score(y_true, y_prob)
    assert np.isclose(score, 0.025)

def test_deficit_recall_calculation():
    y_true = np.array([1, 0, 0, 1])
    y_prob = np.array([0.8, 0.1, 0.6, 0.9])
    # actual deficits (y_true == 0): index 1 and 2 (2 items)
    # predicted deficits (y_prob < 0.5): index 1 (1 item)
    # recall = 1 / 2 = 0.5
    recall = calculate_deficit_recall(y_true, y_prob, threshold_prob=0.5)
    assert np.isclose(recall, 0.5)

def test_accuracy_calculation():
    y_true = np.array([1, 0, 1, 0])
    y_prob = np.array([0.8, 0.2, 0.7, 0.1])
    acc = calculate_accuracy(y_true, y_prob, threshold_prob=0.5)
    assert np.isclose(acc, 1.0)


def test_duckdb_baseline_pipeline_uses_holdout_rows():
    rows = []
    for index, timestamp in enumerate(
        [
            "2024-01-01 10:00:00",
            "2024-01-08 10:00:00",
            "2024-01-15 10:00:00",
            "2024-01-22 10:00:00",
            "2025-05-15 10:00:00",
            "2025-05-22 10:00:00",
        ]
    ):
        row = {
            "station_id": "ST001",
            "feature_as_of": timestamp,
            "current_bike_count": index % 3,
            "split": "train" if index < 4 else "test_holdout",
        }
        for horizon in (1, 2, 3, 4):
            row[f"target_valid_h{horizon}"] = True
            for threshold in (1, 2, 3, 4, 5):
                row[f"label_h{horizon}_t{threshold}"] = int((index % 3) >= threshold)
        rows.append(row)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = pathlib.Path(temp_dir)
        labeled_path = temp_path / "labeled.csv"
        pd.DataFrame(rows).to_csv(labeled_path, index=False)
        metrics = run_baseline_pipeline(
            labeled_csv_path=str(labeled_path),
            output_dir=str(temp_path / "output"),
            memory_limit="256MB",
        )
        assert len(metrics) == 40
        assert set(metrics["sample_count"]) == {2}

if __name__ == '__main__':
    print("[Test Engine] Running test_baseline unit tests...")
    test_brier_score_calculation()
    test_deficit_recall_calculation()
    test_accuracy_calculation()
    print("[PASS] test_baseline unit tests passed 100%!")
