package com.ddarungflow.repository;

import com.ddarungflow.entity.StationPrediction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface StationPredictionRepository extends JpaRepository<StationPrediction, Long> {

    @Query("""
        SELECT sp FROM StationPrediction sp
        JOIN FETCH sp.batch b
        WHERE sp.stationId = :stationId
          AND sp.predictionTargetAt = :predictionTargetAt
          AND sp.horizonMinutes = :horizonMinutes
          AND b.generatedAt <= :requestedAt
          AND b.publishStatus = com.ddarungflow.entity.PredictionPublishStatus.ACTIVE
          AND b.expiresAt > :requestedAt
        ORDER BY b.featureAsOf DESC, b.generatedAt DESC
        """)
    List<StationPrediction> findLatestValidCandidates(
        @Param("stationId") String stationId,
        @Param("predictionTargetAt") OffsetDateTime predictionTargetAt,
        @Param("horizonMinutes") int horizonMinutes,
        @Param("requestedAt") OffsetDateTime requestedAt
    );
}
