import json

import pandas as pd
import pytest

from pipeline.src.build_distribution_artifact import build_artifact
from pipeline.src.staging_distribution_batch import create_staging_batch, load_verified_artifact


def _wide_labels(hour):
    rows = []
    for count in range(6):
        row = {
            "station_id": str(100 + count),
            "feature_as_of": f"2025-01-02T{hour:02d}:00:00Z",
            "current_bike_count": count,
        }
        for horizon in range(1, 5):
            row[f"target_valid_h{horizon}"] = True
            for quantity in range(1, 6):
                row[f"label_h{horizon}_t{quantity}"] = count >= quantity
        rows.append(row)
    return pd.DataFrame(rows)


def test_build_bundle_scores_the_single_train_artifact_and_staging_batch_uses_it(tmp_path):
    train, validation, test = (tmp_path / name for name in ("train.parquet", "validation.parquet", "test.parquet"))
    _wide_labels(8).to_parquet(train)
    _wide_labels(9).to_parquet(validation)
    _wide_labels(10).to_parquet(test)
    output = tmp_path / "bundle"
    result = build_artifact(train, validation, test, output, "data-3.3-test", "a" * 64)
    manifest = json.loads(result["manifest_path"].read_text(encoding="utf-8"))
    assert manifest["sealed_test_brier_scores"]
    assert manifest["artifact_sha256"] == result["artifact_sha256"]

    snapshot = tmp_path / "snapshot.json"
    snapshot.write_text(json.dumps([{
        "stationId": "100", "featureAsOf": "2025-01-02T10:00:00Z",
        "currentBikeCount": 1, "modelVersion": "ignored", "inputManifestHash": "a" * 64,
    }]), encoding="utf-8")
    batch, returned_manifest = create_staging_batch(snapshot, result["artifact_path"], result["manifest_path"], "2025-01-02T10:05:00Z")
    assert returned_manifest["model_version"] == "data-3.3-test"
    assert batch["publishable"] is True
    assert batch["rowCount"] == 20
    assert {row["modelVersion"] for row in batch["rows"]} == {"data-3.3-test"}


def test_staging_batch_rejects_tampered_artifact(tmp_path):
    artifact = tmp_path / "model.joblib"
    artifact.write_bytes(b"not a model")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"artifact_sha256": "0" * 64, "bucket_definition": "0,1,2,3,4,5+"}), encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256"):
        load_verified_artifact(artifact, manifest)
