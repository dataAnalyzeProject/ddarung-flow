"""Unit test suite for EXP-DATA-4.1-MANIFEST module."""

import json
from pathlib import Path

import pytest

from pipeline.src.modelops.evaluation_export import export_metric_rows
from pipeline.src.modelops.manifest import build_model_manifest

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "modelops_metrics_sample.json"


def _sample_valid_metadata():
    """Return a valid metadata dictionary matching the approved contract."""
    return {
        "schemaVersion": "1.0",
        "modelVersion": "hgb-global-v1.0",
        "trainerId": "local-cpu-trainer",
        "trainedAt": "2026-08-18T09:00:00Z",
        "trainingProfile": "cpu_repro",
        "codeCommit": "1628b92bc6683900aa6f2147d0c0de9e59708f29",
        "dataManifestHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "configHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        "artifactSha256": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
        "artifactBytes": 367800,
        "xgboostVersion": "scikit-learn-1.9.0",
        "featureSchemaVersion": "8-features-v1",
        "horizons": [60, 120, 180, 240],
        "requiredBikeCounts": [1, 2, 3, 4, 5],
        "metricsUri": "output/model_winner_metrics.json",
    }


def test_manifest_requires_approved_fields():
    """Verify build_model_manifest requires all approved fields and produces valid manifestSha256."""
    meta = _sample_valid_metadata()
    manifest = build_model_manifest(meta)

    assert manifest["schemaVersion"] == "1.0"
    assert manifest["modelVersion"] == "hgb-global-v1.0"
    assert manifest["horizons"] == [60, 120, 180, 240]
    assert manifest["requiredBikeCounts"] == [1, 2, 3, 4, 5]
    assert len(manifest["manifestSha256"]) == 64

    # Missing required field raises ValueError
    incomplete_meta = dict(meta)
    del incomplete_meta["artifactSha256"]
    with pytest.raises(ValueError, match="missing required manifest fields"):
        build_model_manifest(incomplete_meta)


def test_manifest_invalid_sha256_format():
    """Verify build_model_manifest rejects non-hex64 SHA-256 strings."""
    meta = _sample_valid_metadata()
    meta["artifactSha256"] = "invalid_short_hash"
    with pytest.raises(ValueError, match="invalid sha256 hash"):
        build_model_manifest(meta)


def test_metric_export_requires_all_twenty_combinations():
    """Verify export_metric_rows validates and returns exactly 20 contract rows from sample fixture."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        raw_rows = json.load(file)

    exported = export_metric_rows(raw_rows)
    assert len(exported) == 20

    # Incomplete list raises ValueError
    with pytest.raises(ValueError, match="expected exactly 20 metric rows"):
        export_metric_rows(raw_rows[:10])


def test_metric_export_is_deterministic():
    """Verify export_metric_rows produces identical sorted output regardless of input row order."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        raw_rows = json.load(file)

    exported1 = export_metric_rows(raw_rows)
    exported2 = export_metric_rows(list(reversed(raw_rows)))

    assert exported1 == exported2
    assert exported1[0]["horizonMinutes"] == 60
    assert exported1[0]["requiredBikeCount"] == 1
    assert exported1[-1]["horizonMinutes"] == 240
    assert exported1[-1]["requiredBikeCount"] == 5


def test_metric_export_duplicate_or_invalid_combination():
    """Verify export_metric_rows rejects duplicate or unsupported horizon/quantity combinations."""
    with FIXTURE_PATH.open(encoding="utf-8") as file:
        raw_rows = json.load(file)

    # Introduce duplicate
    duplicate_rows = list(raw_rows)
    duplicate_rows[1] = dict(duplicate_rows[0])
    with pytest.raises(ValueError, match="duplicate combination"):
        export_metric_rows(duplicate_rows)
