CREATE TABLE admin_ops_runtime_risk_snapshots (
    snapshot_id uuid PRIMARY KEY,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    reference_time timestamp with time zone NOT NULL,
    horizon_minutes integer NOT NULL,
    required_bike_count integer NOT NULL,
    min_lng numeric(10,7) NOT NULL,
    min_lat numeric(10,7) NOT NULL,
    max_lng numeric(10,7) NOT NULL,
    max_lat numeric(10,7) NOT NULL,
    data_state_filter varchar(20),
    model_version varchar(160) NOT NULL,
    eligible_station_count integer NOT NULL,
    evaluated_station_count integer NOT NULL,
    normal_inference_success_count integer NOT NULL
);

CREATE TABLE admin_ops_runtime_risk_snapshot_items (
    snapshot_id uuid NOT NULL,
    ordinal integer NOT NULL,
    station_number varchar(20) NOT NULL,
    station_name varchar(100) NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    current_bikes integer,
    data_state varchar(20) NOT NULL,
    at_least_1_probability numeric(12,10),
    at_least_2_probability numeric(12,10),
    at_least_3_probability numeric(12,10),
    at_least_4_probability numeric(12,10),
    at_least_5_probability numeric(12,10),
    selected_shortage_probability numeric(12,10),
    risk_band varchar(20),
    prediction_target_at timestamp with time zone,
    CONSTRAINT pk_admin_ops_runtime_risk_snapshot_items PRIMARY KEY (snapshot_id, ordinal),
    CONSTRAINT fk_admin_ops_runtime_risk_snapshot_items_snapshot FOREIGN KEY (snapshot_id)
        REFERENCES admin_ops_runtime_risk_snapshots(snapshot_id) ON DELETE CASCADE
);

CREATE INDEX ix_admin_ops_runtime_risk_snapshots_expiry ON admin_ops_runtime_risk_snapshots (expires_at);
