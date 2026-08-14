"""Upload a checksum-verified model manifest and immutable inactive pointer to OCI."""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

ARTIFACT_SHA256 = "2f2ece729fd4b03954212d2fcc2ece4cd07110c947fae1dfc0c7ba29cde34db9"
MODEL_PREFIX = f"models/data-3.1/{ARTIFACT_SHA256}"
DEFAULT_ARTIFACT_KEY = f"{MODEL_PREFIX}/model_winner.joblib"
DEFAULT_MANIFEST_KEY = f"{MODEL_PREFIX}/model_winner_metadata.json"
DEFAULT_POINTER_KEY = f"{MODEL_PREFIX}/inactive-pointer.json"
HORIZON_MINUTES = [60, 120, 180, 240]
REQUIRED_BIKE_COUNTS = [1, 2, 3, 4, 5]
COMBINATION_COUNT = 20


def sha256_bytes(content):
    return hashlib.sha256(content).hexdigest()


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _read_response(response):
    raw = response.data.raw
    if hasattr(raw, "stream"):
        return b"".join(raw.stream(1024 * 1024, decode_content=False))
    return raw.read()


def verify_existing_object(client, namespace, bucket, object_key, expected_sha256, expected_size):
    body = _read_response(client.get_object(namespace, bucket, object_key))
    if len(body) != expected_size:
        raise ValueError(f"existing object size differs: {object_key}")
    if sha256_bytes(body) != expected_sha256:
        raise ValueError(f"existing object checksum differs: {object_key}")
    return body


def put_immutable_bytes(client, namespace, bucket, object_key, encoded):
    expected_sha256 = sha256_bytes(encoded)
    try:
        client.put_object(
            namespace,
            bucket,
            object_key,
            io.BytesIO(encoded),
            content_length=len(encoded),
            content_type="application/json",
            if_none_match="*",
            opc_checksum_algorithm="SHA256",
            opc_content_sha256=base64.b64encode(bytes.fromhex(expected_sha256)).decode("ascii"),
            opc_meta={"sha256": expected_sha256},
        )
        return {"created": True, "sha256": expected_sha256, "size_bytes": len(encoded)}
    except Exception as exc:
        if getattr(exc, "status", None) != 412:
            raise
    verify_existing_object(client, namespace, bucket, object_key, expected_sha256, len(encoded))
    return {"created": False, "sha256": expected_sha256, "size_bytes": len(encoded)}


def put_immutable_json(client, namespace, bucket, object_key, payload):
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return put_immutable_bytes(client, namespace, bucket, object_key, encoded)


def load_and_validate_manifest(manifest_path, artifact_sha256):
    content = Path(manifest_path).read_bytes()
    manifest = json.loads(content)
    if manifest.get("artifact_sha256") != artifact_sha256:
        raise ValueError("manifest artifact SHA-256 does not match the verified joblib")
    if manifest.get("horizon_minutes") != HORIZON_MINUTES:
        raise ValueError("manifest horizon_minutes differs from the approved H1-H4 scope")
    if manifest.get("required_bike_counts") != REQUIRED_BIKE_COUNTS:
        raise ValueError("manifest required_bike_counts differs from the approved 1-5 scope")
    combinations = manifest.get("combination_metrics")
    if not isinstance(combinations, list) or len(combinations) != COMBINATION_COUNT:
        raise ValueError("manifest must contain the approved 20 horizon/count combinations")
    return content, manifest


def build_inactive_pointer(artifact_key, artifact_sha256, manifest_key, manifest_sha256, model_version):
    return {
        "schema_version": 1,
        "state": "INACTIVE",
        "model_version": model_version,
        "artifact": {"key": artifact_key, "sha256": artifact_sha256},
        "manifest": {"key": manifest_key, "sha256": manifest_sha256},
        "support": {
            "horizon_minutes": HORIZON_MINUTES,
            "required_bike_counts": REQUIRED_BIKE_COUNTS,
            "combination_count": COMBINATION_COUNT,
        },
    }


def upload_model_delivery(client, namespace, bucket, artifact_path, manifest_path, artifact_key=DEFAULT_ARTIFACT_KEY, manifest_key=DEFAULT_MANIFEST_KEY, pointer_key=DEFAULT_POINTER_KEY):
    artifact_path = Path(artifact_path)
    artifact_sha256 = sha256_file(artifact_path)
    if artifact_sha256 != ARTIFACT_SHA256:
        raise ValueError("local joblib checksum does not match the approved DATA-3.1 artifact")
    artifact_size = artifact_path.stat().st_size
    verify_existing_object(client, namespace, bucket, artifact_key, artifact_sha256, artifact_size)

    manifest_content, _ = load_and_validate_manifest(manifest_path, artifact_sha256)
    manifest_sha256 = sha256_bytes(manifest_content)
    manifest_result = put_immutable_bytes(client, namespace, bucket, manifest_key, manifest_content)
    pointer = build_inactive_pointer(
        artifact_key, artifact_sha256, manifest_key, manifest_sha256,
        model_version=f"data-3.1-{artifact_sha256}",
    )
    pointer_result = put_immutable_json(client, namespace, bucket, pointer_key, pointer)
    return {
        "artifact": {"created": False, "reused": True, "sha256": artifact_sha256, "size_bytes": artifact_size},
        "manifest": manifest_result,
        "pointer": pointer_result,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--namespace")
    parser.add_argument("--artifact-key", default=DEFAULT_ARTIFACT_KEY)
    parser.add_argument("--manifest-key", default=DEFAULT_MANIFEST_KEY)
    parser.add_argument("--pointer-key", default=DEFAULT_POINTER_KEY)
    args = parser.parse_args()
    from pipeline.src.storage.oci_raw_store import create_object_storage_client

    client = create_object_storage_client()
    namespace = args.namespace or client.get_namespace().data
    result = upload_model_delivery(client, namespace, args.bucket, args.artifact, args.manifest, args.artifact_key, args.manifest_key, args.pointer_key)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
