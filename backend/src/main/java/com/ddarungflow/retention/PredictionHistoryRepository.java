package com.ddarungflow.retention;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PredictionHistoryRepository extends JpaRepository<PredictionHistory, Long> {

    List<PredictionHistory> findByUserIdOrderByQueriedAtDesc(Long userId, Pageable pageable);

    List<PredictionHistory> findByUserIdOrderByQueriedAtDesc(Long userId);
}
