package com.ddarungflow.modelops;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(
    name = "model_evaluations",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_model_evaluations_model_horizon_required",
        columnNames = {"model_id", "horizon_minutes", "required_bike_count"}
    )
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ModelEvaluation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "model_id", nullable = false)
    private Long modelId;

    @Column(name = "horizon_minutes", nullable = false)
    private Integer horizonMinutes;

    @Column(name = "required_bike_count", nullable = false)
    private Integer requiredBikeCount;

    @Column(name = "sample_count", nullable = false)
    private Long sampleCount;

    @Column(name = "brier_score", nullable = false, precision = 12, scale = 10)
    private BigDecimal brierScore;

    @Column(name = "shortage_recall", nullable = false, precision = 12, scale = 10)
    private BigDecimal shortageRecall;

    @Column(name = "calibration_error", nullable = false, precision = 12, scale = 10)
    private BigDecimal calibrationError;

    @Column(nullable = false, precision = 12, scale = 10)
    private BigDecimal coverage;

    @Column(name = "monotonicity_violations", nullable = false)
    private Integer monotonicityViolations;

    public ModelEvaluation(
        Long modelId,
        Integer horizonMinutes,
        Integer requiredBikeCount,
        Long sampleCount,
        BigDecimal brierScore,
        BigDecimal shortageRecall,
        BigDecimal calibrationError,
        BigDecimal coverage,
        Integer monotonicityViolations
    ) {
        if (modelId == null) {
            throw new IllegalArgumentException("modelId must not be null");
        }
        if (horizonMinutes == null || !(horizonMinutes == 60 || horizonMinutes == 120 || horizonMinutes == 180 || horizonMinutes == 240)) {
            throw new IllegalArgumentException("horizonMinutes must be 60, 120, 180, or 240");
        }
        if (requiredBikeCount == null || requiredBikeCount < 1 || requiredBikeCount > 5) {
            throw new IllegalArgumentException("requiredBikeCount must be between 1 and 5");
        }
        if (sampleCount == null || sampleCount < 0) {
            throw new IllegalArgumentException("sampleCount must be non-null and non-negative");
        }
        if (brierScore == null || brierScore.compareTo(BigDecimal.ZERO) < 0 || brierScore.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("brierScore must be between 0.0 and 1.0");
        }
        if (shortageRecall == null || shortageRecall.compareTo(BigDecimal.ZERO) < 0 || shortageRecall.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("shortageRecall must be between 0.0 and 1.0");
        }
        if (calibrationError == null || calibrationError.compareTo(BigDecimal.ZERO) < 0 || calibrationError.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("calibrationError must be between 0.0 and 1.0");
        }
        if (coverage == null || coverage.compareTo(BigDecimal.ZERO) < 0 || coverage.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("coverage must be between 0.0 and 1.0");
        }
        if (monotonicityViolations == null || monotonicityViolations < 0) {
            throw new IllegalArgumentException("monotonicityViolations must be non-null and non-negative");
        }

        this.modelId = modelId;
        this.horizonMinutes = horizonMinutes;
        this.requiredBikeCount = requiredBikeCount;
        this.sampleCount = sampleCount;
        this.brierScore = brierScore;
        this.shortageRecall = shortageRecall;
        this.calibrationError = calibrationError;
        this.coverage = coverage;
        this.monotonicityViolations = monotonicityViolations;
    }
}
