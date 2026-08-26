CREATE TABLE model_performance_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    artifact_sha256 VARCHAR(64) NOT NULL,
    model_version VARCHAR(200) NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_model_performance_runs_sha_generated UNIQUE (artifact_sha256, generated_at)
);
CREATE INDEX ix_model_performance_runs_generated_at ON model_performance_runs (generated_at DESC);
