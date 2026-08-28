package com.ddarungflow.retention;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PredictionHistoryRepository extends JpaRepository<PredictionHistory, Long> {

    List<PredictionHistory> findByUserIdOrderByQueriedAtDesc(Long userId, Pageable pageable);

    List<PredictionHistory> findByUserIdOrderByQueriedAtDesc(Long userId);

    Optional<PredictionHistory> findFirstByUserIdOrderByQueriedAtAsc(Long userId);

    Optional<PredictionHistory> findByUserIdAndId(Long userId, Long id);

    long countByUserId(Long userId);

    @org.springframework.data.jpa.repository.Query("select h.availabilityLevel as level, count(h) as scoredCount, "
            + "sum(case when h.outcome = 'HIT' then 1 else 0 end) as hitCount "
            + "from PredictionHistory h where h.userId = :userId and h.outcome in ('HIT', 'MISS') "
            + "group by h.availabilityLevel")
    List<ScoreSummaryRow> summarizeScoresByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);

    interface ScoreSummaryRow {
        String getLevel();
        long getScoredCount();
        long getHitCount();
    }
}
