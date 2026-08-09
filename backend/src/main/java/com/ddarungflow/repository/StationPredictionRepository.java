package com.ddarungflow.repository;

import com.ddarungflow.entity.StationPrediction;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StationPredictionRepository extends JpaRepository<StationPrediction, Long> {
    // TODO(BE-3.2): add the approved latest-valid prediction query only.
}
