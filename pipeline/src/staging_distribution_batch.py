"""Create a one-time staging prediction batch from a verified distribution artifact."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import joblib

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.quantity_distribution import make_distribution_predictor


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_verified_artifact(artifact_path, manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if manifest.get("artifact_sha256") != sha256_file(artifact_path):
        raise ValueError("artifact SHA-256 does not match manifest")
    if manifest.get("bucket_definition") != "0,1,2,3,4,5+":
        raise ValueError("manifest is not an inventory distribution artifact")
    artifact = joblib.load(artifact_path)
    if artifact.get("model_name") != "hist_gradient_boosting_inventory_distribution":
        raise ValueError("artifact model name is invalid")
    return artifact, manifest


def create_staging_batch(snapshot_path, artifact_path, manifest_path, generated_at=None):
    artifact, manifest = load_verified_artifact(artifact_path, manifest_path)
    snapshot = json.loads(Path(snapshot_path).read_text(encoding="utf-8"))
    if not isinstance(snapshot, list):
        raise ValueError("snapshot must be a list of batch input records")
    snapshot = [{**row, "modelVersion": manifest["model_version"]} for row in snapshot]
    return run_batch_inference(
        snapshot,
        predictor=make_distribution_predictor(artifact),
        generated_at=generated_at,
    ), manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--generated-at")
    args = parser.parse_args()
    result, manifest = create_staging_batch(
        args.snapshot, args.artifact, args.manifest, args.generated_at
    )
    if not result["publishable"]:
        raise RuntimeError("staging batch is not publishable: " + "; ".join(result["errors"]))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"publishable": True, "row_count": result["rowCount"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
