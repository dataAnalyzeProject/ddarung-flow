"""Build the approved JSON manifest for an XGBoost UBJSON artifact."""

REQUIRED_FIELDS = (
    "schemaVersion", "modelVersion", "trainerId", "trainedAt",
    "trainingProfile", "codeCommit", "dataManifestHash", "configHash",
    "artifactSha256", "artifactBytes", "xgboostVersion",
    "featureSchemaVersion", "horizons", "requiredBikeCounts", "metricsUri",
)


def build_model_manifest(metadata):
    """Return a validated manifest. Implement TODO(EXP-DATA-1) only."""
    raise NotImplementedError("TODO(EXP-DATA-1): validate and return manifest")
