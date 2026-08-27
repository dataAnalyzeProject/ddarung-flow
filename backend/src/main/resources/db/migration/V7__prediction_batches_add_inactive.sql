ALTER TABLE prediction_batches DROP CONSTRAINT prediction_batches_publish_status_check;
ALTER TABLE prediction_batches ADD CONSTRAINT prediction_batches_publish_status_check
    CHECK (publish_status IN ('STAGING', 'ACTIVE', 'REJECTED', 'EXPIRED', 'INACTIVE'));
