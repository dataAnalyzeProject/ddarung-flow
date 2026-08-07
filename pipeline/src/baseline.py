import argparse
import os

import duckdb
import numpy as np
import pandas as pd


HORIZONS = (1, 2, 3, 4)
THRESHOLDS = (1, 2, 3, 4, 5)


def calculate_brier_score(y_true, y_prob):
    return np.mean((y_prob - y_true) ** 2)


def calculate_deficit_recall(y_true, y_prob, threshold_prob=0.5):
    actual_deficits = y_true == 0
    if actual_deficits.sum() == 0:
        return 0.0
    predicted_deficits = y_prob < threshold_prob
    return np.sum(actual_deficits & predicted_deficits) / np.sum(actual_deficits)


def calculate_calibration_error(y_true, y_prob, num_bins=10):
    if len(y_true) == 0:
        return 0.0
    boundaries = np.linspace(0, 1, num_bins + 1)
    error = 0.0
    for index in range(num_bins):
        lower = boundaries[index]
        upper = boundaries[index + 1]
        in_bin = (y_prob >= lower) & (
            y_prob <= upper if index == num_bins - 1 else y_prob < upper
        )
        if np.any(in_bin):
            error += abs(np.mean(y_true[in_bin]) - np.mean(y_prob[in_bin])) * np.mean(
                in_bin
            )
    return error


def calculate_accuracy(y_true, y_prob, threshold_prob=0.5):
    return np.mean(y_true == (y_prob >= threshold_prob).astype(int))


def _sql_path(path):
    return os.path.abspath(path).replace("\\", "/").replace("'", "''")


def _configure_duckdb(connection, memory_limit, temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
    connection.execute(f"SET memory_limit = '{memory_limit}'")
    connection.execute(f"SET temp_directory = '{_sql_path(temp_dir)}'")
    connection.execute("SET preserve_insertion_order = false")


def _metric_query(relation, variant, horizon, threshold):
    label = f"label_h{horizon}_t{threshold}"
    valid = f"target_valid_h{horizon}"
    variant_filter = ""
    if variant == "exclude_2022":
        variant_filter = "AND feature_as_of >= TIMESTAMP '2024-01-01 00:00:00'"
    return f"""
        WITH train_groups AS (
            SELECT
                station_id,
                dayofweek(feature_as_of) AS day_of_week,
                hour(feature_as_of) AS hour_of_day,
                AVG({label}) AS stat_prob
            FROM {relation}
            WHERE split = 'train' AND {valid} AND {label} IS NOT NULL
              {variant_filter}
            GROUP BY station_id, day_of_week, hour_of_day
        ),
        global_mean AS (
            SELECT COALESCE(AVG({label}), 0.5) AS probability
            FROM {relation}
            WHERE split = 'train' AND {valid} AND {label} IS NOT NULL
              {variant_filter}
        ),
        scored AS (
            SELECT
                CAST(test.{label} AS DOUBLE) AS y_true,
                CAST(test.current_bike_count >= {threshold} AS DOUBLE) AS persistence_prob,
                COALESCE(groups.stat_prob, global_mean.probability) AS statistical_prob
            FROM {relation} test
            LEFT JOIN train_groups groups
              ON groups.station_id = test.station_id
             AND groups.day_of_week = dayofweek(test.feature_as_of)
             AND groups.hour_of_day = hour(test.feature_as_of)
            CROSS JOIN global_mean
            WHERE test.split = 'test_holdout'
              AND test.{valid}
              AND test.{label} IS NOT NULL
        ),
        persistence_bins AS (
            SELECT
                LEAST(9, CAST(FLOOR(persistence_prob * 10) AS INTEGER)) AS bin_id,
                COUNT(*) AS bin_count,
                AVG(y_true) AS actual_rate,
                AVG(persistence_prob) AS predicted_rate
            FROM scored GROUP BY bin_id
        ),
        statistical_bins AS (
            SELECT
                LEAST(9, CAST(FLOOR(statistical_prob * 10) AS INTEGER)) AS bin_id,
                COUNT(*) AS bin_count,
                AVG(y_true) AS actual_rate,
                AVG(statistical_prob) AS predicted_rate
            FROM scored GROUP BY bin_id
        )
        SELECT
            COUNT(*) AS sample_count,
            AVG(POWER(persistence_prob - y_true, 2)) AS persistence_brier_score,
            COALESCE(
                SUM(CASE WHEN y_true = 0 AND persistence_prob < 0.5 THEN 1 ELSE 0 END)
                / NULLIF(SUM(CASE WHEN y_true = 0 THEN 1 ELSE 0 END), 0),
                0
            ) AS persistence_deficit_recall,
            COALESCE((
                SELECT SUM(bin_count * ABS(actual_rate - predicted_rate))
                       / NULLIF(SUM(bin_count), 0)
                FROM persistence_bins
            ), 0) AS persistence_calibration_error,
            AVG(CAST(y_true = CAST(persistence_prob >= 0.5 AS DOUBLE) AS DOUBLE))
                AS persistence_accuracy,
            AVG(POWER(statistical_prob - y_true, 2)) AS statistical_brier_score,
            COALESCE(
                SUM(CASE WHEN y_true = 0 AND statistical_prob < 0.5 THEN 1 ELSE 0 END)
                / NULLIF(SUM(CASE WHEN y_true = 0 THEN 1 ELSE 0 END), 0),
                0
            ) AS statistical_deficit_recall,
            COALESCE((
                SELECT SUM(bin_count * ABS(actual_rate - predicted_rate))
                       / NULLIF(SUM(bin_count), 0)
                FROM statistical_bins
            ), 0) AS statistical_calibration_error,
            AVG(CAST(y_true = CAST(statistical_prob >= 0.5 AS DOUBLE) AS DOUBLE))
                AS statistical_accuracy
        FROM scored
    """


def _evaluate_relation(connection, relation):
    metric_rows = []
    for variant in ("exclude_2022", "include_2022"):
        for horizon in HORIZONS:
            for threshold in THRESHOLDS:
                values = connection.execute(
                    _metric_query(relation, variant, horizon, threshold)
                ).fetchone()
                if not values or values[0] == 0:
                    continue
                metric_names = [
                    "sample_count",
                    "persistence_brier_score",
                    "persistence_deficit_recall",
                    "persistence_calibration_error",
                    "persistence_accuracy",
                    "statistical_brier_score",
                    "statistical_deficit_recall",
                    "statistical_calibration_error",
                    "statistical_accuracy",
                ]
                metrics = dict(zip(metric_names, values))
                metric_rows.append(
                    {
                        "training_variant": variant,
                        "horizon_minutes": horizon * 60,
                        "required_bike_count": threshold,
                        **{
                            name: int(value)
                            if name == "sample_count"
                            else round(float(value), 4)
                            for name, value in metrics.items()
                        },
                    }
                )
    return pd.DataFrame(metric_rows)


def evaluate_baseline_models(df_labeled, output_dir="output"):
    """Compatibility API for small in-memory tests and callers."""
    os.makedirs(output_dir, exist_ok=True)
    connection = duckdb.connect()
    try:
        connection.register("labeled_input", df_labeled)
        metrics = _evaluate_relation(connection, "labeled_input")
    finally:
        connection.close()
    metrics.to_csv(
        os.path.join(output_dir, "baseline_metrics_summary.csv"),
        index=False,
        encoding="utf-8-sig",
    )
    return metrics


def run_baseline_pipeline(
    labeled_csv_path="output/labeled_dataset.csv",
    output_dir="output",
    memory_limit="4GB",
    temp_dir=None,
):
    if not os.path.exists(labeled_csv_path):
        raise FileNotFoundError(f"Labeled CSV does not exist: {labeled_csv_path}")
    os.makedirs(output_dir, exist_ok=True)
    if temp_dir is None:
        temp_dir = os.path.join(output_dir, ".duckdb_tmp")

    connection = duckdb.connect()
    try:
        _configure_duckdb(connection, memory_limit, temp_dir)
        connection.execute(
            f"""
            CREATE TEMP VIEW labeled AS
            SELECT * FROM read_csv_auto(
                '{_sql_path(labeled_csv_path)}', header=true
            )
            """
        )
        metrics = _evaluate_relation(connection, "labeled")
    finally:
        connection.close()

    output_path = os.path.join(output_dir, "baseline_metrics_summary.csv")
    metrics.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"[Baseline] wrote {output_path}")
    print(f"[Baseline] memory_limit={memory_limit}, temp_directory={temp_dir}")
    print(metrics.to_string(index=False))
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DATA-2.1 baseline evaluation")
    parser.add_argument("--labeled-csv", default="output/labeled_dataset.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--memory-limit", default="4GB")
    parser.add_argument("--temp-dir", default=None)
    arguments = parser.parse_args()
    run_baseline_pipeline(
        labeled_csv_path=arguments.labeled_csv,
        output_dir=arguments.output_dir,
        memory_limit=arguments.memory_limit,
        temp_dir=arguments.temp_dir,
    )
