"""Build a private inventory-distribution artifact from pre-split wide samples."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.src.quantity_distribution import (
    distribution_records_from_tail_labels,
    evaluate_distribution_artifact,
    train_distribution_model,
    write_artifact_bundle,
)


def build_artifact(train_path, validation_path, test_path, output_directory, model_version, input_manifest_sha256):
    train = distribution_records_from_tail_labels(pd.read_parquet(train_path), "train")
    validation = distribution_records_from_tail_labels(pd.read_parquet(validation_path), "validation")
    test = distribution_records_from_tail_labels(pd.read_parquet(test_path), "test")
    artifact, validation_metrics = train_distribution_model(
        pd.concat([train, validation], ignore_index=True), target_split="validation"
    )
    test_metrics = evaluate_distribution_artifact(artifact, test)
    manifest = {
        "schema_version": 1,
        "model_version": model_version,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_name": artifact["model_name"],
        "bucket_definition": artifact["bucket_definition"],
        "feature_columns": artifact["feature_columns"],
        "input_manifest_sha256": input_manifest_sha256,
        "horizon_minutes": [60, 120, 180, 240],
        "required_bike_counts": [1, 2, 3, 4, 5],
        "combination_metrics": [
            {"horizon_minutes": horizon, "required_bike_count": quantity}
            for horizon in (60, 120, 180, 240)
            for quantity in (1, 2, 3, 4, 5)
        ],
        "validation_brier_scores": validation_metrics["brier_scores"],
        "sealed_test_brier_scores": test_metrics["brier_scores"],
    }
    return write_artifact_bundle(artifact, manifest, output_directory)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", required=True, type=Path)
    parser.add_argument("--validation", required=True, type=Path)
    parser.add_argument("--test", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--input-manifest-sha256", required=True)
    args = parser.parse_args()
    result = build_artifact(
        args.train,
        args.validation,
        args.test,
        args.output,
        args.model_version,
        args.input_manifest_sha256,
    )
    print(json.dumps({key: str(value) for key, value in result.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
