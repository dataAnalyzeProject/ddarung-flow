package com.ddarungflow.retention;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface SavedPredictionRouteRepository extends JpaRepository<SavedPredictionRoute,Long> {
 Optional<SavedPredictionRoute> findByUserIdAndRouteKey(Long userId,String routeKey);
 List<SavedPredictionRoute> findByUserIdOrderByCreatedAtDesc(Long userId);
 Optional<SavedPredictionRoute> findByUserIdAndId(Long userId,Long id);
 long countByUserId(Long userId);
}
