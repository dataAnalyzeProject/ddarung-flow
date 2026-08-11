package com.ddarungflow.modelops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ModelEvaluationRepository extends JpaRepository<ModelEvaluation, Long> {
    List<ModelEvaluation> findAllByModelId(Long modelId);
}
