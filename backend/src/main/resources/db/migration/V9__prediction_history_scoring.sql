ALTER TABLE prediction_histories
    ADD COLUMN actual_bike_count INTEGER,
    ADD COLUMN outcome VARCHAR(20),
    ADD COLUMN scored_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX ix_prediction_histories_unscored
    ON prediction_histories (prediction_target_at)
    WHERE scored_at IS NULL;
