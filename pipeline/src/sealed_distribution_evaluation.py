"""Sealed evaluation module for destination inventory 6-bucket distribution models (DATA-5.2).

Evaluates the canonical 20 combinations (4 horizons x 5 required bike counts)
on fixed sealed test split data, strictly enforcing SHA integrity, 6-bucket model
contracts, probability ranges, monotonicity, and calibration metrics.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Union

import numpy as np
import pandas as pd
import joblib

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.src.quantity_distribution import (
    HORIZONS,
    QUANTITIES,
    validate_distribution_records,
    distribution_records_from_tail_labels,
    _feature_frame,
    tail_probabilities,
)

EXPECTED_ARTIFACT_SHA256 = "ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741"
EXPECTED_MANIFEST_SHA256 = "973b90ff6e44dc62529396e5773ce3d2001b68861aa10e68b490ec58dc2b4a95"
EXPECTED_SEALED_INPUT_SHA256 = "6fe7a0ac8b21c43b9df7d853e5e4070a7bbefeeae7431fb5b5ec1e2ea3c485292"
EXPECTED_RAW_MANIFEST_SHA256 = "9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7"
REQUIRED_MODEL_VERSION = "data-3.3-inventory-distribution-2026-08-18"
REQUIRED_BUCKET_DEFINITION = "0,1,2,3,4,5+"
REQUIRED_SPLIT = "test"


def compute_file_sha256(file_path: Union[str, Path]) -> str:
    """Compute the SHA-256 hash of a file."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_pre_evaluation_integrity(
    artifact_path: Union[str, Path],
    manifest_path: Union[str, Path],
    sealed_input_path: Union[str, Path],
    expected_artifact_sha: str = EXPECTED_ARTIFACT_SHA256,
    expected_manifest_sha: str = EXPECTED_MANIFEST_SHA256,
    expected_sealed_input_sha: str = EXPECTED_SEALED_INPUT_SHA256,
) -> Dict[str, Any]:
    """Verify file existence, SHA-256 integrity, and manifest metadata BEFORE loading joblib."""
    # 1. SHA checks
    actual_artifact_sha = compute_file_sha256(artifact_path)
    if actual_artifact_sha.lower() != expected_artifact_sha.lower():
        raise ValueError(
            f"Artifact SHA-256 mismatch: expected {expected_artifact_sha}, got {actual_artifact_sha}"
        )

    actual_manifest_sha = compute_file_sha256(manifest_path)
    if actual_manifest_sha.lower() != expected_manifest_sha.lower():
        raise ValueError(
            f"Manifest SHA-256 mismatch: expected {expected_manifest_sha}, got {actual_manifest_sha}"
        )

    actual_sealed_input_sha = compute_file_sha256(sealed_input_path)
    if actual_sealed_input_sha.lower() != expected_sealed_input_sha.lower():
        raise ValueError(
            f"Sealed input SHA-256 mismatch: expected {expected_sealed_input_sha}, got {actual_sealed_input_sha}"
        )

    # 2. Manifest content checks
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)

    if manifest_data.get("model_version") != REQUIRED_MODEL_VERSION:
        raise ValueError(
            f"Manifest model_version mismatch: expected '{REQUIRED_MODEL_VERSION}', got '{manifest_data.get('model_version')}'"
        )

    if manifest_data.get("bucket_definition") != REQUIRED_BUCKET_DEFINITION:
        raise ValueError(
            f"Manifest bucket_definition mismatch: expected '{REQUIRED_BUCKET_DEFINITION}', got '{manifest_data.get('bucket_definition')}'"
        )

    raw_manifest_sha = manifest_data.get("input_manifest_sha256", "")
    if raw_manifest_sha.lower() != EXPECTED_RAW_MANIFEST_SHA256.lower():
        raise ValueError(
            f"Manifest input_manifest_sha256 mismatch: expected '{EXPECTED_RAW_MANIFEST_SHA256}', got '{raw_manifest_sha}'"
        )

    if manifest_data.get("artifact_sha256", "").lower() != expected_artifact_sha.lower():
        raise ValueError(
            f"Manifest artifact_sha256 mismatch: expected '{expected_artifact_sha}', got '{manifest_data.get('artifact_sha256')}'"
        )

    return manifest_data


def validate_model_artifact(artifact: Any) -> None:
    """Validate that the loaded model artifact conforms to the 6-bucket contract."""
    if not isinstance(artifact, dict) or "model" not in artifact:
        raise ValueError("Invalid model artifact: must be a dict with a 'model' key")

    bucket_def = artifact.get("bucket_definition")
    model_obj = artifact["model"]
    classes = getattr(model_obj, "classes_", None)

    if bucket_def != REQUIRED_BUCKET_DEFINITION or classes is None or len(classes) != 6:
        raise ValueError(
            f"Rejected: model artifact must be a 6-bucket distribution model ({REQUIRED_BUCKET_DEFINITION})"
        )


def compute_expected_calibration_error(
    predicted_probs: np.ndarray,
    actual_binary: np.ndarray,
    num_bins: int = 10,
) -> float:
    """Compute Expected Calibration Error (ECE) using equal-width bins in [0, 1]."""
    bin_edges = np.linspace(0.0, 1.0, num_bins + 1)
    bin_indices = np.digitize(predicted_probs, bin_edges, right=True)
    # Clip indices to range 1..num_bins
    bin_indices = np.clip(bin_indices, 1, num_bins)

    total_samples = len(predicted_probs)
    if total_samples == 0:
        return 0.0

    ece = 0.0
    for b in range(1, num_bins + 1):
        mask = bin_indices == b
        bin_count = int(np.sum(mask))
        if bin_count > 0:
            weight = bin_count / total_samples
            bin_acc = float(np.mean(actual_binary[mask]))
            bin_conf = float(np.mean(predicted_probs[mask]))
            ece += weight * abs(bin_acc - bin_conf)

    return float(ece)


def evaluate_sealed_distribution_records(
    artifact: Dict[str, Any],
    records: Union[pd.DataFrame, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Evaluate 6-bucket distribution model on 20 canonical combinations and compute rigorous metrics."""
    validate_model_artifact(artifact)

    frame = validate_distribution_records(records)
    splits = set(frame["split"].unique())
    if splits != {REQUIRED_SPLIT}:
        raise ValueError(f"Rejected: data must contain only '{REQUIRED_SPLIT}' split records, got {splits}")

    model_obj = artifact["model"]
    classes = getattr(model_obj, "classes_")
    features = _feature_frame(frame).reindex(columns=artifact["feature_columns"], fill_value=0.0)
    raw_probs = model_obj.predict_proba(features)
    tails = tail_probabilities(raw_probs, classes)

    # Validate probability bounds with numerical epsilon tolerance
    if (tails < -1e-9).any() or (tails > 1.0 + 1e-9).any():
        raise ValueError("Rejected: predicted probabilities must be within [0.0, 1.0]")
    tails = np.clip(tails, 0.0, 1.0)

    # Validate monotonicity (probability must not increase as required quantity increases)
    diffs = np.diff(tails, axis=1)
    if (diffs > 1e-9).any():
        raise ValueError("Rejected: monotonicity violation detected (probability increased for larger quantity)")

    actual_future = frame["future_bike_count"].to_numpy()
    results = []

    for horizon in HORIZONS:
        horizon_mask = (frame["horizon_minutes"] == horizon).to_numpy()
        if not np.any(horizon_mask):
            raise ValueError(f"Rejected: missing records for horizon_minutes={horizon}")

        for q_idx, quantity in enumerate(QUANTITIES):
            sub_tails = tails[horizon_mask, q_idx]
            sub_actual = actual_future[horizon_mask]

            sample_count = int(len(sub_actual))
            if sample_count == 0:
                raise ValueError(f"Rejected: empty sample for horizon={horizon}, quantity={quantity}")

            actual_binary = (sub_actual >= quantity).astype(int)
            predicted_binary = (sub_tails >= 0.5).astype(int)

            success_count = int(np.sum(actual_binary == 1))
            deficit_count = int(np.sum(actual_binary == 0))

            brier_score = float(np.mean((sub_tails - actual_binary) ** 2))
            accuracy = float(np.mean(predicted_binary == actual_binary))

            if deficit_count == 0:
                deficit_recall: Union[float, str] = "NOT_EVALUABLE"
                deficit_recall_reason = "No observed deficit samples in sealed test split"
            else:
                # Deficit recall: proportion of actual deficits (0) correctly predicted as deficit (p < 0.5)
                deficit_recall = float(np.sum((actual_binary == 0) & (sub_tails < 0.5)) / deficit_count)
                deficit_recall_reason = None

            calibration_error = compute_expected_calibration_error(sub_tails, actual_binary, num_bins=10)
            prob_min = float(np.min(sub_tails))
            prob_max = float(np.max(sub_tails))

            row: Dict[str, Any] = {
                "horizonMinutes": int(horizon),
                "requiredBikeCount": int(quantity),
                "sampleCount": sample_count,
                "successCount": success_count,
                "deficitCount": deficit_count,
                "brierScore": round(brier_score, 4),
                "accuracy": round(accuracy, 4),
                "deficitRecall": round(deficit_recall, 4) if isinstance(deficit_recall, (int, float)) else deficit_recall,
                "calibrationError": round(calibration_error, 4),
                "probabilityMin": round(prob_min, 4),
                "probabilityMax": round(prob_max, 4),
            }
            if deficit_recall_reason:
                row["deficitRecallReason"] = deficit_recall_reason

            results.append(row)

    if len(results) != 20:
        raise ValueError(f"Rejected: expected exactly 20 combination results, got {len(results)}")

    return results


def run_sealed_evaluation(
    artifact_path: Union[str, Path],
    manifest_path: Union[str, Path],
    sealed_input_path: Union[str, Path],
    output_dir: Union[str, Path],
    expected_artifact_sha: str = EXPECTED_ARTIFACT_SHA256,
    expected_manifest_sha: str = EXPECTED_MANIFEST_SHA256,
    expected_sealed_input_sha: str = EXPECTED_SEALED_INPUT_SHA256,
) -> Dict[str, Any]:
    """Execute complete sealed evaluation pipeline and output evidence bundle."""
    # 1. Pre-validation of hashes and manifest before loading joblib
    manifest_data = validate_pre_evaluation_integrity(
        artifact_path,
        manifest_path,
        sealed_input_path,
        expected_artifact_sha=expected_artifact_sha,
        expected_manifest_sha=expected_manifest_sha,
        expected_sealed_input_sha=expected_sealed_input_sha,
    )

    # 2. Load model artifact
    artifact = joblib.load(artifact_path)
    validate_model_artifact(artifact)

    # 3. Load sealed input and convert wide labels to test records
    raw_df = pd.read_parquet(sealed_input_path)
    test_records = distribution_records_from_tail_labels(raw_df, REQUIRED_SPLIT)

    # 4. Evaluate 20 combinations
    combinations_20 = evaluate_sealed_distribution_records(artifact, test_records)

    # 5. Build summary output
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    comb_file = output_path / "sealed_evaluation_20_combinations.json"
    summary_file = output_path / "sealed_evaluation_summary.json"
    checksum_file = output_path / "SHA256SUMS"

    comb_file.write_text(json.dumps(combinations_20, indent=2, ensure_ascii=False), encoding="utf-8")

    avg_brier = float(np.mean([r["brierScore"] for r in combinations_20]))
    avg_acc = float(np.mean([r["accuracy"] for r in combinations_20]))
    avg_cal_err = float(np.mean([r["calibrationError"] for r in combinations_20]))

    summary_data = {
        "task_id": "DATA-5.2",
        "model_version": REQUIRED_MODEL_VERSION,
        "test_dataset_label": "reconstructed historical test",
        "artifact_sha256": expected_artifact_sha,
        "manifest_sha256": expected_manifest_sha,
        "sealed_input_sha256": expected_sealed_input_sha,
        "raw_manifest_sha256": EXPECTED_RAW_MANIFEST_SHA256,
        "total_combinations": len(combinations_20),
        "total_samples": int(combinations_20[0]["sampleCount"]) if combinations_20 else 0,
        "overall_metrics": {
            "mean_brier_score": round(avg_brier, 4),
            "mean_accuracy": round(avg_acc, 4),
            "mean_calibration_error": round(avg_cal_err, 4),
        },
        "monotonicity_verified": True,
        "probability_bounds_verified": True,
    }
    summary_file.write_text(json.dumps(summary_data, indent=2, ensure_ascii=False), encoding="utf-8")

    comb_sha = hashlib.sha256(comb_file.read_bytes()).hexdigest()
    summary_sha = hashlib.sha256(summary_file.read_bytes()).hexdigest()

    checksum_file.write_text(
        f"{comb_sha}  {comb_file.name}\n{summary_sha}  {summary_file.name}\n",
        encoding="utf-8",
    )

    return {
        "combinations_path": str(comb_file),
        "summary_path": str(summary_file),
        "checksum_path": str(checksum_file),
        "combinations_sha256": comb_sha,
        "summary_sha256": summary_sha,
        "evaluated_combinations": len(combinations_20),
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate 6-bucket distribution model on sealed test split.")
    parser.add_argument("--artifact", required=True, type=Path, help="Path to model.joblib")
    parser.add_argument("--manifest", required=True, type=Path, help="Path to model_manifest.json")
    parser.add_argument("--sealed-input", required=True, type=Path, help="Path to sealed test_wide_labels.parquet")
    parser.add_argument("--output", required=True, type=Path, help="Output evidence directory")
    parser.add_argument(
        "--expected-artifact-sha256",
        default=EXPECTED_ARTIFACT_SHA256,
        help="Expected artifact SHA-256",
    )
    parser.add_argument(
        "--expected-manifest-sha256",
        default=EXPECTED_MANIFEST_SHA256,
        help="Expected manifest SHA-256",
    )
    parser.add_argument(
        "--expected-sealed-input-sha256",
        default=EXPECTED_SEALED_INPUT_SHA256,
        help="Expected sealed input SHA-256",
    )

    args = parser.parse_args()
    result = run_sealed_evaluation(
        artifact_path=args.artifact,
        manifest_path=args.manifest,
        sealed_input_path=args.sealed_input,
        output_dir=args.output,
        expected_artifact_sha=args.expected_artifact_sha256,
        expected_manifest_sha=args.expected_manifest_sha256,
        expected_sealed_input_sha=args.expected_sealed_input_sha256,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
