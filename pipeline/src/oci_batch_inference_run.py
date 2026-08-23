"""PREDICT-OPS-MVP-03 orchestration: connect the real OCI-delivered model artifact and
the real OCI curated inventory snapshot to the existing DATA-3.2 batch-inference and
publishing pipeline.

This module does not write to PostgreSQL. It produces a run_batch_inference()-shaped
JSON result file; the existing publish_prediction_batch.py --batch-result <that file>
does the actual STAGING/ACTIVE write, exactly as it already does for any other batch
result. No new business logic is introduced here -- this is glue over three modules
that already exist and are already tested:
  - infra/inference/app.py: pointer/manifest/artifact download + checksum verification
    (reused read-only, not modified)
  - pipeline/src/batch_inference.py: run_batch_inference()
  - pipeline/src/storage/oci_raw_store.py + curated_snapshot_store.py: OCI client and
    the curated snapshot object layout

It also bridges one real gap found only by running against real data: the curated
snapshot identifies stations by station_id (e.g. "ST-10", the real-time collection
API's own code), but the approved model was trained on the numeric station_number
the backend's `stations` table already carries (e.g. 108). See
load_station_number_mapping() and --station-mapping-csv.
"""

import argparse
import csv
import hashlib
import io
import json
import sys
import tempfile
from pathlib import Path

if __name__ == "__main__":
    # Allow `python pipeline/src/oci_batch_inference_run.py ...` from the repo root
    # without a separate PYTHONPATH export, matching batch_inference.py's convention.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from infra.inference.app import (
    _model_parts,
    download_and_verify,
    download_bytes_and_verify,
    validate_distribution_artifact,
    validate_manifest,
    validate_pointer,
)
from pipeline.src.batch_inference import run_batch_inference
from pipeline.src.modeling import enforce_quantity_monotonicity
from pipeline.src.storage.curated_snapshot_store import CURATED_SNAPSHOT_COLUMNS
from pipeline.src.storage.oci_raw_store import create_object_storage_client

SUPPORTED_HORIZONS = (60, 120, 180, 240)
SUPPORTED_QUANTITIES = (1, 2, 3, 4, 5)


def load_verified_model(object_storage, namespace, bucket, pointer_key, pointer_sha256):
    """Download and checksum-verify the approved pointer -> manifest -> artifact chain.

    Follows the exact same verification steps as infra/inference/app.py's
    load_pointer_model()/load_model(), reusing its primitives so the security-critical
    checksum logic is not duplicated. Returns (validated_model_bundle, pointer, manifest).
    """
    settings = {"OCI_OBJECT_NAMESPACE": namespace, "MODEL_BUCKET": bucket}
    pointer = validate_pointer(
        json.loads(download_bytes_and_verify(object_storage, settings, pointer_key, pointer_sha256))
    )
    manifest = json.loads(
        download_bytes_and_verify(object_storage, settings, pointer["manifest"]["key"], pointer["manifest"]["sha256"])
    )
    validate_manifest(manifest, pointer)

    artifact_settings = {
        **settings,
        "MODEL_OBJECT_KEY": pointer["artifact"]["key"],
        "MODEL_SHA256": pointer["artifact"]["sha256"],
    }
    # delete=False + explicit close before download_and_verify re-opens the path:
    # on Windows a NamedTemporaryFile left open holds an exclusive lock, so passing
    # its still-open .name to a second open(..., "wb") raises PermissionError.
    artifact_handle = tempfile.NamedTemporaryFile(suffix=".joblib", delete=False)
    artifact_path = Path(artifact_handle.name)
    artifact_handle.close()
    try:
        download_and_verify(object_storage, artifact_settings, str(artifact_path))
        import joblib

        bundle = validate_distribution_artifact(joblib.load(artifact_path))
    finally:
        artifact_path.unlink(missing_ok=True)
    return bundle, pointer, manifest


def find_latest_curated_snapshot_key(object_storage, namespace, bucket, prefix="curated/"):
    """List curated snapshot objects and return the lexicographically-latest key.

    curated_snapshot_store.py partitions as
    curated/year=YYYY/month=MM/day=DD/observed_<timestamp>.parquet with zero-padded
    date/time components, so lexicographic max == most recent.
    """
    latest = None
    start = None
    while True:
        response = object_storage.list_objects(namespace, bucket, prefix=prefix, start=start, fields="name")
        for obj in response.data.objects:
            if obj.name.endswith(".parquet") and (latest is None or obj.name > latest):
                latest = obj.name
        start = getattr(response.data, "next_start_with", None)
        if not start:
            break
    if latest is None:
        raise RuntimeError(f"no curated snapshot object found under prefix {prefix!r}")
    return latest


def load_curated_snapshot(object_storage, namespace, bucket, object_key):
    """Download one curated snapshot Parquet object (all active stations, one observed_at)."""
    response = object_storage.get_object(namespace, bucket, object_key)
    body = b"".join(response.data.raw.stream(1024 * 1024, decode_content=False))
    frame = pd.read_parquet(io.BytesIO(body))
    missing = set(CURATED_SNAPSHOT_COLUMNS) - set(frame.columns)
    if missing:
        raise RuntimeError(f"curated snapshot is missing columns: {sorted(missing)}")
    return frame


def load_station_number_mapping(csv_path):
    """Read the station_id -> station_number mapping exported from the backend
    `stations` table (columns: station_id, station_number).

    This mapping exists only in Postgres (backend/src/main/java/.../entity/Station.java),
    not in OCI or the curated snapshot, so it must be supplied as a file. See
    PREDICT-OPS-MVP-03's work order for the export query and why this mapping is
    needed: the curated snapshot's station_id ("ST-10", the real-time collection
    API's own identifier) differs from the numeric station_number the approved model
    was trained on (the official Seoul bike station number).
    """
    mapping = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            station_id = row["station_id"].strip()
            station_number = row["station_number"].strip()
            if station_id and station_number:
                mapping[station_id] = int(station_number)
    if not mapping:
        raise RuntimeError(f"station mapping file {csv_path!r} produced no usable rows")
    return mapping


def build_station_inputs(curated_frame, model_version, input_manifest_hash, station_number_by_id):
    """Turn one curated snapshot DataFrame into the station_input dicts
    run_batch_inference() requires.

    Skips a row (rather than fabricating a value) when:
    - bike_count or observed_at is null (missing observation), or
    - station_id has no entry in station_number_by_id (station master mapping gap,
      e.g. a newly added station not yet exported into the mapping file) -- the
      approved model has no numeric station_number to predict against for it.
    """
    inputs = []
    skipped_unmapped = 0
    for _, row in curated_frame.iterrows():
        if pd.isna(row["bike_count"]) or pd.isna(row["observed_at"]):
            continue
        station_id = str(row["station_id"])
        if station_id not in station_number_by_id:
            skipped_unmapped += 1
            continue
        inputs.append(
            {
                "stationId": station_id,
                "featureAsOf": str(row["observed_at"]),
                "currentBikeCount": int(row["bike_count"]),
                "modelVersion": model_version,
                "inputManifestHash": input_manifest_hash,
            }
        )
    if skipped_unmapped:
        print(f"warning: skipped {skipped_unmapped} station(s) with no station_number mapping", file=sys.stderr)
    return inputs


def make_predictor(model_bundle, station_number_by_id):
    """Wrap the joblib model to match run_batch_inference()'s predictor contract.

    batch_inference.py builds feature rows in (station, horizon)-major order with 5
    consecutive rows per (station, horizon) group that differ only in
    required_bike_count. The approved model itself does not take required_bike_count
    as an input feature (see infra/inference/app.py EXPECTED_FEATURE_NAMES) -- it
    predicts a bucket-count distribution (classes 0..5, bucket_definition
    "0,1,2,3,4,5+") for a given (station, time, horizon), and
    P(available >= quantity) is the tail sum over classes [quantity..5]. This mirrors
    infra/inference/app.py's _tail_probabilities for the on-demand path.

    pipeline/docs/DATA-3.2-result.md's real-scale leader run found that feeding the
    model's raw output straight through (without tail-summing + monotonicity
    correction) violates the required non-increasing-by-quantity contract in about
    10% of groups, so enforce_quantity_monotonicity is applied per group here, same
    as that run did.

    station_number_by_id translates each feature row's station_id (the curated
    snapshot's string identifier, e.g. "ST-10") into the numeric station_number the
    model was actually trained on (e.g. 108) -- see load_station_number_mapping().
    build_station_inputs() already filters out any station_id missing from this
    mapping, so every lookup here is expected to succeed.
    """
    model, _ = _model_parts(model_bundle)

    def predictor(feature_rows):
        if len(feature_rows) % len(SUPPORTED_QUANTITIES) != 0:
            raise ValueError("feature rows must come in complete quantity groups of 5")

        group_rows = []
        for group_start in range(0, len(feature_rows), len(SUPPORTED_QUANTITIES)):
            first = feature_rows[group_start]
            group_rows.append(
                (
                    station_number_by_id[first["station_id"]],
                    first["day_of_week"],
                    first["hour_of_day"],
                    first["month"],
                    first["is_weekend"],
                    first["current_bike_count"],
                    first["horizon_minutes"],
                )
            )

        probabilities = model.predict_proba(group_rows)
        classes = [int(value) for value in model.classes_]

        results = []
        for row in probabilities:
            buckets = {bucket: float(value) for bucket, value in zip(classes, row)}
            tails = [sum(buckets.get(bucket, 0.0) for bucket in range(quantity, 6)) for quantity in SUPPORTED_QUANTITIES]
            results.extend(enforce_quantity_monotonicity(tails))
        return results

    return predictor


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Run real OCI-backed batch inference and write a publishable batch-result JSON."
    )
    parser.add_argument("--artifact-pointer", required=True, help="Approved INACTIVE pointer object key.")
    parser.add_argument(
        "--artifact-pointer-sha256", required=True, help="SHA-256 of the pointer object, from the acceptance record."
    )
    parser.add_argument(
        "--curated-source",
        required=False,
        help="Explicit curated snapshot object key; auto-discovers the latest under 'curated/' if omitted.",
    )
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--namespace", required=False)
    parser.add_argument(
        "--station-mapping-csv",
        required=True,
        type=Path,
        help="CSV with station_id,station_number columns, exported from the backend "
        "stations table. The approved model predicts against station_number; the "
        "curated snapshot only carries station_id.",
    )
    parser.add_argument("--result-file", required=True, type=Path)
    args = parser.parse_args(argv)

    object_storage = create_object_storage_client()
    namespace = args.namespace or object_storage.get_namespace().data

    model_bundle, pointer, _manifest = load_verified_model(
        object_storage, namespace, args.bucket, args.artifact_pointer, args.artifact_pointer_sha256
    )
    station_number_by_id = load_station_number_mapping(args.station_mapping_csv)

    curated_key = args.curated_source or find_latest_curated_snapshot_key(object_storage, namespace, args.bucket)
    curated_frame = load_curated_snapshot(object_storage, namespace, args.bucket, curated_key)

    input_manifest_hash = hashlib.sha256(curated_key.encode("utf-8")).hexdigest()
    station_inputs = build_station_inputs(curated_frame, pointer["model_version"], input_manifest_hash, station_number_by_id)

    result = run_batch_inference(station_inputs, predictor=make_predictor(model_bundle, station_number_by_id))

    args.result_file.parent.mkdir(parents=True, exist_ok=True)
    with args.result_file.open("w", encoding="utf-8") as out:
        json.dump(result, out, ensure_ascii=False)

    print(
        json.dumps(
            {
                "rowCount": result["rowCount"],
                "publishable": result["publishable"],
                "errors": result["errors"][:10],
                "batchId": result["batchId"],
                "curatedSourceKey": curated_key,
                "stationCount": len(station_inputs),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if result["publishable"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
