CREATE TABLE admin_ops_global_risk_results (
    result_id uuid PRIMARY KEY,
    reference_time timestamp with time zone NOT NULL,
    generated_at timestamp with time zone NOT NULL,
    published_at timestamp with time zone NOT NULL,
    fresh_until timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    model_version varchar(160),
    active_public_station_count integer NOT NULL CHECK (active_public_station_count >= 0),
    inventory_eligible_count integer NOT NULL CHECK (inventory_eligible_count >= 0),
    evaluated_count integer NOT NULL CHECK (evaluated_count >= 0),
    normal_inference_count integer NOT NULL CHECK (normal_inference_count >= 0),
    inventory_missing_count integer NOT NULL CHECK (inventory_missing_count >= 0),
    inventory_delayed_count integer NOT NULL CHECK (inventory_delayed_count >= 0),
    inventory_unavailable_count integer NOT NULL CHECK (inventory_unavailable_count >= 0),
    inference_insufficient_count integer NOT NULL CHECK (inference_insufficient_count >= 0),
    unevaluated_count integer NOT NULL CHECK (unevaluated_count >= 0),
    inference_call_count integer NOT NULL CHECK (inference_call_count >= 0),
    generation_duration_ms bigint NOT NULL CHECK (generation_duration_ms >= 0),
    CONSTRAINT ck_admin_ops_global_coverage CHECK (
        inventory_eligible_count <= active_public_station_count
        AND evaluated_count <= inventory_eligible_count
        AND normal_inference_count + inference_insufficient_count <= evaluated_count
        AND unevaluated_count = inventory_eligible_count - evaluated_count
    )
);

CREATE TABLE admin_ops_global_risk_items (
    result_id uuid NOT NULL,
    station_number varchar(20) NOT NULL,
    horizon_minutes integer NOT NULL CHECK (horizon_minutes IN (60, 120, 180, 240)),
    station_name varchar(100) NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    current_bikes integer,
    inventory_collected_at timestamp with time zone,
    data_state varchar(20) NOT NULL,
    at_least_1_probability numeric(12,10),
    at_least_2_probability numeric(12,10),
    at_least_3_probability numeric(12,10),
    at_least_4_probability numeric(12,10),
    at_least_5_probability numeric(12,10),
    prediction_target_at timestamp with time zone,
    CONSTRAINT pk_admin_ops_global_risk_items PRIMARY KEY (result_id, station_number, horizon_minutes),
    CONSTRAINT fk_admin_ops_global_risk_items_result FOREIGN KEY (result_id)
        REFERENCES admin_ops_global_risk_results(result_id) ON DELETE CASCADE,
    CONSTRAINT ck_admin_ops_global_item_probabilities CHECK (
        (data_state = 'NORMAL' AND at_least_1_probability IS NOT NULL AND at_least_2_probability IS NOT NULL
         AND at_least_3_probability IS NOT NULL AND at_least_4_probability IS NOT NULL
         AND at_least_5_probability IS NOT NULL AND prediction_target_at IS NOT NULL)
        OR
        (data_state <> 'NORMAL' AND at_least_1_probability IS NULL AND at_least_2_probability IS NULL
         AND at_least_3_probability IS NULL AND at_least_4_probability IS NULL
         AND at_least_5_probability IS NULL AND prediction_target_at IS NULL)
    ),
    CONSTRAINT ck_admin_ops_global_item_probability_bounds CHECK (
        (at_least_1_probability IS NULL OR at_least_1_probability BETWEEN 0 AND 1)
        AND (at_least_2_probability IS NULL OR at_least_2_probability BETWEEN 0 AND 1)
        AND (at_least_3_probability IS NULL OR at_least_3_probability BETWEEN 0 AND 1)
        AND (at_least_4_probability IS NULL OR at_least_4_probability BETWEEN 0 AND 1)
        AND (at_least_5_probability IS NULL OR at_least_5_probability BETWEEN 0 AND 1)
    ),
    CONSTRAINT ck_admin_ops_global_item_probability_monotonic CHECK (
        at_least_1_probability IS NULL OR (
            at_least_1_probability >= at_least_2_probability
            AND at_least_2_probability >= at_least_3_probability
            AND at_least_3_probability >= at_least_4_probability
            AND at_least_4_probability >= at_least_5_probability
        )
    )
);

CREATE INDEX ix_admin_ops_global_risk_items_rank
    ON admin_ops_global_risk_items (result_id, horizon_minutes, station_number);

CREATE TABLE admin_ops_global_risk_control (
    control_key varchar(32) PRIMARY KEY,
    lease_owner uuid,
    lease_started_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    map_priority_requested_at timestamp with time zone,
    current_result_id uuid,
    previous_result_id uuid,
    latest_attempt_id uuid,
    latest_attempt_started_at timestamp with time zone,
    latest_attempt_finished_at timestamp with time zone,
    latest_attempt_state varchar(20),
    latest_attempt_reason varchar(80),
    latest_attempt_call_count integer,
    CONSTRAINT fk_admin_ops_global_current FOREIGN KEY (current_result_id) REFERENCES admin_ops_global_risk_results(result_id),
    CONSTRAINT fk_admin_ops_global_previous FOREIGN KEY (previous_result_id) REFERENCES admin_ops_global_risk_results(result_id)
);

INSERT INTO admin_ops_global_risk_control (control_key) VALUES ('GLOBAL');
