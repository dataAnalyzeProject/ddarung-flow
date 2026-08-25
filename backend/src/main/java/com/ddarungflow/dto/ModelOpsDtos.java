package com.ddarungflow.dto;

import com.ddarungflow.modelops.ModelArtifact;
import com.ddarungflow.modelops.ModelArtifactState;
import com.ddarungflow.modelops.ModelEvaluation;
import com.ddarungflow.modelops.ModelUpload;
import com.ddarungflow.modelops.ModelUploadStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class ModelOpsDtos {

    private ModelOpsDtos() {
    }

    public record CreateUploadRequest(String objectKey, String expectedSha256, Long maxBytes, OffsetDateTime expiresAt) {
    }

    public record CreateModelRequest(
        String version,
        String artifactKey,
        String sha256,
        String codeCommit,
        String dataManifestHash,
        String configHash,
        String featureSchemaVersion
    ) {
    }

    public record ModelResponse(
        Long id,
        String version,
        String artifactKey,
        String sha256,
        String codeCommit,
        String dataManifestHash,
        String configHash,
        String featureSchemaVersion,
        ModelArtifactState state,
        OffsetDateTime createdAt
    ) {
        public static ModelResponse from(ModelArtifact artifact) {
            return new ModelResponse(
                artifact.getId(), artifact.getVersion(), artifact.getArtifactKey(), artifact.getSha256(),
                artifact.getCodeCommit(), artifact.getDataManifestHash(), artifact.getConfigHash(),
                artifact.getFeatureSchemaVersion(), artifact.getState(), artifact.getCreatedAt()
            );
        }
    }

    public record UploadResponse(
        UUID id,
        String objectKey,
        String expectedSha256,
        Long maxBytes,
        ModelUploadStatus status,
        OffsetDateTime expiresAt,
        OffsetDateTime completedAt,
        OffsetDateTime createdAt
    ) {
        public static UploadResponse from(ModelUpload upload) {
            return new UploadResponse(
                upload.getId(), upload.getObjectKey(), upload.getExpectedSha256(), upload.getMaxBytes(),
                upload.getStatus(), upload.getExpiresAt(), upload.getCompletedAt(), upload.getCreatedAt()
            );
        }
    }

    public record MetricsResponse(Long modelId, List<MetricResponse> metrics) {
    }

    public record MetricResponse(
        Integer horizonMinutes,
        Integer requiredBikeCount,
        Long sampleCount,
        BigDecimal brierScore,
        BigDecimal shortageRecall,
        BigDecimal calibrationError,
        BigDecimal coverage,
        Integer monotonicityViolations
    ) {
        public static MetricResponse from(ModelEvaluation evaluation) {
            return new MetricResponse(
                evaluation.getHorizonMinutes(), evaluation.getRequiredBikeCount(), evaluation.getSampleCount(),
                evaluation.getBrierScore(), evaluation.getShortageRecall(), evaluation.getCalibrationError(),
                evaluation.getCoverage(), evaluation.getMonotonicityViolations()
            );
        }
    }
}
