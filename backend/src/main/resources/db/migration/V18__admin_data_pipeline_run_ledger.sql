CREATE TABLE admin_data_pipeline_runs (
    run_id VARCHAR(36) PRIMARY KEY,
    pipeline_key VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    failure_stage VARCHAR(20),
    reason_code VARCHAR(64),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    source_collected_at TIMESTAMP WITH TIME ZONE,
    source_count BIGINT,
    validated_count BIGINT,
    published_count BIGINT,
    normal_count BIGINT,
    missing_count BIGINT,
    CONSTRAINT admin_data_pipeline_runs_pipeline_check
        CHECK (pipeline_key IN ('CURRENT_INVENTORY')),
    CONSTRAINT admin_data_pipeline_runs_status_check
        CHECK (status IN ('SUCCESS', 'FAILURE')),
    CONSTRAINT admin_data_pipeline_runs_failure_stage_check
        CHECK (failure_stage IS NULL OR failure_stage IN ('SOURCE', 'QUALITY', 'SERVING')),
    CONSTRAINT admin_data_pipeline_runs_time_check
        CHECK (completed_at >= started_at),
    CONSTRAINT admin_data_pipeline_runs_status_payload_check
        CHECK ((status = 'SUCCESS'
                AND failure_stage IS NULL AND reason_code IS NULL
                AND source_collected_at IS NOT NULL
                AND source_count IS NOT NULL AND validated_count IS NOT NULL
                AND published_count IS NOT NULL AND normal_count IS NOT NULL AND missing_count IS NOT NULL)
            OR (status = 'FAILURE' AND failure_stage IS NOT NULL AND reason_code IS NOT NULL)),
    CONSTRAINT admin_data_pipeline_runs_count_check
        CHECK ((source_count IS NULL OR source_count >= 0)
            AND (validated_count IS NULL OR validated_count >= 0)
            AND (published_count IS NULL OR published_count >= 0)
            AND (normal_count IS NULL OR normal_count >= 0)
            AND (missing_count IS NULL OR missing_count >= 0)
            AND (source_count IS NULL OR validated_count IS NULL OR validated_count <= source_count)
            AND (status <> 'SUCCESS' OR normal_count + missing_count = published_count))
);

CREATE INDEX idx_admin_data_pipeline_runs_latest
    ON admin_data_pipeline_runs (pipeline_key, completed_at);
