ALTER TABLE model_artifacts
    ADD COLUMN IF NOT EXISTS manifest_key varchar(512),
    ADD COLUMN IF NOT EXISTS manifest_sha256 varchar(64);
