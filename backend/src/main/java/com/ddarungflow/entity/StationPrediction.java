package com.ddarungflow.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import lombok.AllArgsConstructor;

@Entity
@Table(
    name = "station_predictions",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_station_predictions_batch_station_target",
        columnNames = {"batch_id", "station_id", "prediction_target_at"}
    )
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class StationPrediction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id", nullable = false)
    private PredictionBatch batch;

    @Column(name = "station_id", nullable = false, length = 50)
    private String stationId;

    @Column(name = "prediction_target_at", nullable = false)
    private OffsetDateTime predictionTargetAt;

    @Column(name = "horizon_minutes", nullable = false)
    private Integer horizonMinutes;

    @Column(name = "at_least_1_probability", nullable = false, precision = 8, scale = 7)
    private BigDecimal atLeast1Probability;

    @Column(name = "at_least_2_probability", nullable = false, precision = 8, scale = 7)
    private BigDecimal atLeast2Probability;

    @Column(name = "at_least_3_probability", nullable = false, precision = 8, scale = 7)
    private BigDecimal atLeast3Probability;

    @Column(name = "at_least_4_probability", nullable = false, precision = 8, scale = 7)
    private BigDecimal atLeast4Probability;

    @Column(name = "at_least_5_probability", nullable = false, precision = 8, scale = 7)
    private BigDecimal atLeast5Probability;

    @Column(name = "prediction_status", nullable = false, length = 20)
    private String predictionStatus;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
