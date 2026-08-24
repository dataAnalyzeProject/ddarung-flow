package com.ddarungflow.retention;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "prediction_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PredictionHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "query_condition", nullable = false, columnDefinition = "TEXT")
    private String queryCondition;

    @Column(name = "summary_result", nullable = false, columnDefinition = "TEXT")
    private String summaryResult;

    @Column(name = "queried_at", nullable = false, updatable = false)
    private OffsetDateTime queriedAt;

    @PrePersist
    public void prePersist() {
        if (this.queriedAt == null) {
            this.queriedAt = OffsetDateTime.now();
        }
    }

    @Builder
    public PredictionHistory(Long userId, String queryCondition, String summaryResult) {
        this.userId = userId;
        this.queryCondition = queryCondition;
        this.summaryResult = summaryResult;
    }
}
