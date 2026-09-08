ALTER TABLE model_uploads
    ADD COLUMN observed_sha256 varchar(64),
    ADD COLUMN observed_bytes bigint,
    ADD COLUMN stored_at timestamptz;

ALTER TABLE model_uploads DROP CONSTRAINT model_uploads_status_check;
ALTER TABLE model_uploads ADD CONSTRAINT model_uploads_status_check
    CHECK (status IN ('CREATED', 'UPLOADED', 'COMPLETED', 'FAILED', 'EXPIRED'));

ALTER TABLE model_uploads ADD CONSTRAINT model_uploads_observed_integrity_check CHECK (
    (status IN ('CREATED', 'FAILED', 'EXPIRED') AND observed_sha256 IS NULL AND observed_bytes IS NULL AND stored_at IS NULL)
    OR
    (status = 'COMPLETED' AND observed_sha256 IS NULL AND observed_bytes IS NULL AND stored_at IS NULL)
    OR
    (status IN ('UPLOADED', 'COMPLETED') AND observed_sha256 IS NOT NULL AND observed_bytes IS NOT NULL AND observed_bytes >= 0 AND stored_at IS NOT NULL)
);
