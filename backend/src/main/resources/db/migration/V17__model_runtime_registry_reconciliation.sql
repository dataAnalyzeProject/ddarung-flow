ALTER TABLE model_artifacts ALTER COLUMN trainer_user_id DROP NOT NULL;
ALTER TABLE model_artifacts ALTER COLUMN code_commit DROP NOT NULL;
ALTER TABLE model_artifacts ALTER COLUMN data_manifest_hash DROP NOT NULL;
ALTER TABLE model_artifacts ALTER COLUMN config_hash DROP NOT NULL;
ALTER TABLE model_artifacts ALTER COLUMN feature_schema_version DROP NOT NULL;

ALTER TABLE model_artifacts
    ADD COLUMN source_origin varchar(20) NOT NULL DEFAULT 'REGISTERED';

ALTER TABLE model_artifacts
    ADD CONSTRAINT model_artifacts_source_provenance_check CHECK (
        (source_origin = 'REGISTERED'
            AND trainer_user_id IS NOT NULL
            AND code_commit IS NOT NULL
            AND data_manifest_hash IS NOT NULL
            AND config_hash IS NOT NULL
            AND feature_schema_version IS NOT NULL)
        OR
        (source_origin = 'RUNTIME_IMPORTED'
            AND state IN ('ACTIVE', 'RETIRED')
            AND trainer_user_id IS NULL
            AND code_commit IS NULL
            AND data_manifest_hash IS NULL
            AND config_hash IS NULL
            AND feature_schema_version IS NULL)
    );
