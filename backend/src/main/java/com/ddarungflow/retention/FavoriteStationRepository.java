package com.ddarungflow.retention;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FavoriteStationRepository extends JpaRepository<FavoriteStation, Long> {

    List<FavoriteStation> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<FavoriteStation> findByUserIdAndStationId(Long userId, Long stationId);

    long countByUserId(Long userId);

    Optional<FavoriteStation> findByUserIdAndId(Long userId, Long id);

    void deleteByUserIdAndId(Long userId, Long id);
}
