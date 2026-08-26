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
}
