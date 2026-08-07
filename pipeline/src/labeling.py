import argparse
import json
import os

import duckdb
import numpy as np
import pandas as pd


HORIZONS = (1, 2, 3, 4)
THRESHOLDS = (1, 2, 3, 4, 5)


def load_data_split_config(config_path=None):
    if not config_path:
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "config",
            "data_split.json",
        )

    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as config_file:
            return json.load(config_file)
    return {
        "train_range": {
            "start_timestamp": "2024-01-01 00:00:00",
            "end_timestamp": "2025-05-14 23:00:00",
        },
        "holdout_test_range": {
            "start_timestamp": "2025-05-15 00:00:00",
            "end_timestamp": "2025-12-31 23:00:00",
        },
    }


def _assign_split(feature_as_of, train_end, test_start):
    split = pd.Series("buffer_excluded", index=feature_as_of.index, dtype="object")
    split.loc[feature_as_of <= train_end] = "train"
    split.loc[feature_as_of >= test_start] = "test_holdout"
    return split


def generate_h1_h4_labels(df_curated, config_path=None):
    """Generate exact H1-H4 labels for small in-memory inputs and unit tests."""
    df = df_curated.copy()
    if "dt" not in df.columns:
        df["dt"] = pd.to_datetime(df["observed_at"])
    if "st" not in df.columns:
        df["st"] = df["station_id"].astype(str)
    if "bike_cnt" not in df.columns:
        df["bike_cnt"] = pd.to_numeric(df["bike_count"], errors="coerce")

    df = (
        df.dropna(subset=["st", "dt", "bike_cnt"])
        .sort_values(["st", "dt"])
        .drop_duplicates(["st", "dt"], keep="first")
        .reset_index(drop=True)
    )
    result = pd.DataFrame(
        {
            "station_id": df["st"],
            "feature_as_of": df["dt"],
            "current_bike_count": df["bike_cnt"],
        }
    )

    config = load_data_split_config(config_path)
    train_end = pd.to_datetime(config["train_range"]["end_timestamp"])
    test_start = pd.to_datetime(config["holdout_test_range"]["start_timestamp"])
    result["split"] = _assign_split(result["feature_as_of"], train_end, test_start)

    lookup = df.set_index(["st", "dt"])["bike_cnt"]
    for horizon in HORIZONS:
        target_at = result["feature_as_of"] + pd.Timedelta(hours=horizon)
        target_index = pd.MultiIndex.from_arrays([result["station_id"], target_at])
        future_count = pd.Series(lookup.reindex(target_index).to_numpy(), index=result.index)
        no_boundary_leakage = ~(
            (result["split"] == "train") & (target_at >= test_start)
        )
        valid = future_count.notna() & no_boundary_leakage

        result[f"prediction_target_at_h{horizon}"] = target_at
        result[f"future_bike_count_h{horizon}"] = future_count
        result[f"target_valid_h{horizon}"] = valid
        for threshold in THRESHOLDS:
            result[f"label_h{horizon}_t{threshold}"] = np.where(
                valid,
                (future_count >= threshold).astype(float),
                np.nan,
            )

    return result


def _sql_path(path):
    return os.path.abspath(path).replace("\\", "/").replace("'", "''")


def _sql_timestamp(value):
    return str(pd.to_datetime(value)).replace("'", "''")


def _configure_duckdb(connection, memory_limit, temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
    connection.execute(f"SET memory_limit = '{memory_limit}'")
    connection.execute(f"SET temp_directory = '{_sql_path(temp_dir)}'")
    connection.execute("SET preserve_insertion_order = false")


def _label_select_sql(test_start, relation="curated"):
    select_columns = [
        "base.station_id",
        "base.observed_at AS feature_as_of",
        "base.bike_count AS current_bike_count",
    ]
    joins = []
    for horizon in HORIZONS:
        target_expression = f"base.observed_at + INTERVAL '{horizon} hours'"
        valid_expression = (
            f"future_h{horizon}.bike_count IS NOT NULL "
            f"AND NOT (base.split = 'train' AND {target_expression} >= "
            f"TIMESTAMP '{test_start}')"
        )
        select_columns.extend(
            [
                f"{target_expression} AS prediction_target_at_h{horizon}",
                f"future_h{horizon}.bike_count AS future_bike_count_h{horizon}",
                f"({valid_expression}) AS target_valid_h{horizon}",
            ]
        )
        for threshold in THRESHOLDS:
            select_columns.append(
                f"CASE WHEN {valid_expression} THEN "
                f"CAST(future_h{horizon}.bike_count >= {threshold} AS INTEGER) "
                f"ELSE NULL END AS label_h{horizon}_t{threshold}"
            )
        joins.append(
            f"LEFT JOIN {relation} future_h{horizon} "
            f"ON future_h{horizon}.station_id = base.station_id "
            f"AND future_h{horizon}.observed_at = {target_expression}"
        )
    select_columns.append("base.split")
    return (
        "SELECT\n  "
        + ",\n  ".join(select_columns)
        + f"\nFROM {relation} base\n"
        + "\n".join(joins)
    )


def _combine_csv_parts(part_paths, output_path):
    with open(output_path, "wb") as output_file:
        for index, part_path in enumerate(part_paths):
            with open(part_path, "rb") as part_file:
                if index > 0:
                    part_file.readline()
                while True:
                    block = part_file.read(8 * 1024 * 1024)
                    if not block:
                        break
                    output_file.write(block)


def run_labeling_pipeline(
    curated_csv_path="output/curated_inventory.csv",
    output_dir="output",
    config_path=None,
    memory_limit="4GB",
    temp_dir=None,
    partitions=32,
):
    """Create the labeled CSV with disk-backed DuckDB joins."""
    if not os.path.exists(curated_csv_path):
        raise FileNotFoundError(f"Curated CSV does not exist: {curated_csv_path}")

    os.makedirs(output_dir, exist_ok=True)
    if temp_dir is None:
        temp_dir = os.path.join(output_dir, ".duckdb_tmp")
    labeled_path = os.path.join(output_dir, "labeled_dataset.csv")
    summary_path = os.path.join(output_dir, "labeling_summary.csv")

    config = load_data_split_config(config_path)
    train_end = _sql_timestamp(config["train_range"]["end_timestamp"])
    test_start = _sql_timestamp(config["holdout_test_range"]["start_timestamp"])

    os.makedirs(temp_dir, exist_ok=True)
    database_path = os.path.join(temp_dir, "labeling.duckdb")
    connection = duckdb.connect(database_path)
    try:
        _configure_duckdb(connection, memory_limit, temp_dir)
        if partitions < 1:
            raise ValueError("partitions must be at least 1")
        connection.execute(
            f"""
            CREATE OR REPLACE TABLE curated AS
            SELECT
                CAST(station_id AS VARCHAR) AS station_id,
                CAST(observed_at AS TIMESTAMP) AS observed_at,
                TRY_CAST(bike_count AS DOUBLE) AS bike_count,
                CAST(hash(CAST(station_id AS VARCHAR)) % {partitions} AS INTEGER)
                    AS bucket_id
            FROM read_csv_auto('{_sql_path(curated_csv_path)}', header=true)
            WHERE station_id IS NOT NULL
              AND TRY_CAST(observed_at AS TIMESTAMP) IS NOT NULL
              AND TRY_CAST(bike_count AS DOUBLE) IS NOT NULL
            """
        )
        duplicate_count = connection.execute(
            """
            SELECT COUNT(*) - COUNT(DISTINCT (station_id, observed_at))
            FROM curated
            """
        ).fetchone()[0]
        if duplicate_count:
            raise ValueError(
                "Curated input contains duplicate station/time keys: "
                f"{duplicate_count:,}"
            )
        parts_dir = os.path.join(output_dir, ".label_parts")
        os.makedirs(parts_dir, exist_ok=True)
        part_paths = []
        for bucket_id in range(partitions):
            part_path = os.path.join(parts_dir, f"labeled-{bucket_id:03d}.csv")
            part_paths.append(part_path)
            connection.execute(
                f"""
                CREATE OR REPLACE TABLE label_bucket AS
                SELECT station_id, observed_at, bike_count,
                    CASE
                        WHEN observed_at <= TIMESTAMP '{train_end}' THEN 'train'
                        WHEN observed_at >= TIMESTAMP '{test_start}' THEN 'test_holdout'
                        ELSE 'buffer_excluded'
                    END AS split
                FROM curated
                WHERE bucket_id = {bucket_id}
                """
            )
            label_sql = _label_select_sql(test_start, relation="label_bucket")
            connection.execute(
                f"""
                COPY (
                    {label_sql}
                    ORDER BY station_id, feature_as_of
                ) TO '{_sql_path(part_path)}' (HEADER, DELIMITER ',')
                """
            )
            print(f"[Labeling] completed partition {bucket_id + 1}/{partitions}")
        _combine_csv_parts(part_paths, labeled_path)
        for part_path in part_paths:
            os.remove(part_path)
        os.rmdir(parts_dir)
        connection.execute(
            f"""
            CREATE TEMP VIEW labeled AS
            SELECT * FROM read_csv_auto('{_sql_path(labeled_path)}', header=true)
            """
        )
        summary_queries = []
        for horizon in HORIZONS:
            threshold_rates = []
            for threshold in THRESHOLDS:
                threshold_rates.append(
                    f"ROUND(100.0 * SUM(CASE WHEN label_h{horizon}_t{threshold} = 1 "
                    f"THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN target_valid_h{horizon} "
                    f"THEN 1 ELSE 0 END), 0), 2) AS t{threshold}_success_rate"
                )
            summary_queries.append(
                f"""
                SELECT 'H{horizon}' AS horizon, {horizon * 60} AS minutes,
                    SUM(CASE WHEN target_valid_h{horizon} THEN 1 ELSE 0 END) AS valid_count,
                    COUNT(*) AS total_base,
                    ROUND(100.0 * SUM(CASE WHEN target_valid_h{horizon} THEN 1 ELSE 0 END)
                        / NULLIF(COUNT(*), 0), 2) AS presence_rate,
                    {', '.join(threshold_rates)}
                FROM labeled
                """
            )
        summary = connection.execute(" UNION ALL ".join(summary_queries)).fetchdf()
        summary.to_csv(summary_path, index=False, encoding="utf-8-sig")
    finally:
        connection.close()

    print(f"[Labeling] wrote {labeled_path}")
    print(f"[Labeling] memory_limit={memory_limit}, temp_directory={temp_dir}")
    print(summary.to_string(index=False))
    return labeled_path, summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DATA-2.1 H1-H4 labeling pipeline")
    parser.add_argument("--curated-csv", default="output/curated_inventory.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--config", default=None)
    parser.add_argument("--memory-limit", default="4GB")
    parser.add_argument("--temp-dir", default=None)
    parser.add_argument("--partitions", type=int, default=32)
    arguments = parser.parse_args()
    run_labeling_pipeline(
        curated_csv_path=arguments.curated_csv,
        output_dir=arguments.output_dir,
        config_path=arguments.config,
        memory_limit=arguments.memory_limit,
        temp_dir=arguments.temp_dir,
        partitions=arguments.partitions,
    )
