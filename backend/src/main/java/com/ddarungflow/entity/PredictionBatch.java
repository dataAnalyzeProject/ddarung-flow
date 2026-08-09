package com.ddarungflow.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "prediction_batches")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PredictionBatch {

    @Id
    @Column(name = "batch_id", nullable = false, updatable = false)
    private UUID batchId;

    @Column(name = "model_version", nullable = false, length = 100)
    private String modelVersion;

    @Column(name = "feature_as_of", nullable = false)
    private OffsetDateTime featureAsOf;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "publish_status", nullable = false, length = 20)
    private PredictionPublishStatus publishStatus;

    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "pipeline_run_id", length = 255)
    private String pipelineRunId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public PredictionBatch(
        UUID batchId,
        String modelVersion,
        OffsetDateTime featureAsOf,
        OffsetDateTime generatedAt,
        PredictionPublishStatus publishStatus,
        OffsetDateTime publishedAt,
        OffsetDateTime expiresAt,
        String pipelineRunId,
        OffsetDateTime createdAt
    ) {
        this.batchId = batchId;
        this.modelVersion = modelVersion;
        this.featureAsOf = featureAsOf;
        this.generatedAt = generatedAt;
        this.publishStatus = publishStatus;
        this.publishedAt = publishedAt;
        this.expiresAt = expiresAt;
        this.pipelineRunId = pipelineRunId;
        this.createdAt = createdAt;
    }
}
