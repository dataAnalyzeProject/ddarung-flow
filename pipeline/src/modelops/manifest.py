"""Build and validate the approved JSON manifest for a model artifact."""

import hashlib
import json
import re
from typing import Any, Dict

HEX_64_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")

REQUIRED_FIELDS = (
    "schemaVersion",
    "modelVersion",
    "trainerId",
    "trainedAt",
    "trainingProfile",
    "codeCommit",
    "dataManifestHash",
    "configHash",
    "artifactSha256",
    "artifactBytes",
    "xgboostVersion",
    "featureSchemaVersion",
    "horizons",
    "requiredBikeCounts",
    "metricsUri",
)

EXPECTED_HORIZONS = [60, 120, 180, 240]
EXPECTED_BIKE_COUNTS = [1, 2, 3, 4, 5]


def _is_valid_hex64(val: Any) -> bool:
    if not isinstance(val, str):
        return False
    return bool(HEX_64_PATTERN.match(val))


def build_model_manifest(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Validate metadata dict against the model manifest contract and return canonical manifest dict.

    Raises ValueError if required fields are missing, types are wrong, or hash formats are invalid.
    """
    if not isinstance(metadata, dict):
        raise ValueError("metadata must be a dictionary")

    missing = set(REQUIRED_FIELDS) - set(metadata.keys())
    if missing:
        raise ValueError(f"missing required manifest fields: {sorted(missing)}")

    # Validate hash fields
    for hash_field in ("dataManifestHash", "configHash", "artifactSha256"):
        val = metadata[hash_field]
        if not _is_valid_hex64(val):
            raise ValueError(f"invalid sha256 hash for field '{hash_field}': {val}")

    # Validate numeric / list fields
    if not isinstance(metadata["artifactBytes"], int) or metadata["artifactBytes"] < 0:
        raise ValueError(f"invalid artifactBytes: {metadata['artifactBytes']}")

    horizons = list(metadata["horizons"])
    if horizons != EXPECTED_HORIZONS:
        raise ValueError(f"invalid horizons: {horizons}, expected {EXPECTED_HORIZONS}")

    bike_counts = list(metadata["requiredBikeCounts"])
    if bike_counts != EXPECTED_BIKE_COUNTS:
        raise ValueError(f"invalid requiredBikeCounts: {bike_counts}, expected {EXPECTED_BIKE_COUNTS}")

    # Construct canonical manifest dict in fixed key order
    manifest = {
        "schemaVersion": str(metadata["schemaVersion"]),
        "modelVersion": str(metadata["modelVersion"]),
        "trainerId": str(metadata["trainerId"]),
        "trainedAt": str(metadata["trainedAt"]),
        "trainingProfile": str(metadata["trainingProfile"]),
        "codeCommit": str(metadata["codeCommit"]),
        "dataManifestHash": str(metadata["dataManifestHash"]).lower(),
        "configHash": str(metadata["configHash"]).lower(),
        "artifactSha256": str(metadata["artifactSha256"]).lower(),
        "artifactBytes": int(metadata["artifactBytes"]),
        "xgboostVersion": str(metadata["xgboostVersion"]),
        "featureSchemaVersion": str(metadata["featureSchemaVersion"]),
        "horizons": EXPECTED_HORIZONS,
        "requiredBikeCounts": EXPECTED_BIKE_COUNTS,
        "metricsUri": str(metadata["metricsUri"]),
    }

    # Compute deterministic SHA-256 hash of canonical JSON string
    canonical_json = json.dumps(manifest, sort_keys=True, ensure_ascii=True)
    manifest["manifestSha256"] = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    return manifest
