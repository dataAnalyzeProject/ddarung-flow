CREATE TABLE station_rhythm_profiles (
    station_id VARCHAR(50) PRIMARY KEY,
    window_start DATE NOT NULL,
    window_end DATE NOT NULL,
    sample_count BIGINT NOT NULL,
    payload JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL
);
