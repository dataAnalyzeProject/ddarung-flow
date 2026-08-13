package com.ddarungflow.repository;

import com.ddarungflow.entity.Station;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface StationRepository extends JpaRepository<Station, String> {

    @Query("""
        SELECT s FROM Station s
        WHERE s.active = true
          AND s.latitude BETWEEN :minLat AND :maxLat
          AND s.longitude BETWEEN :minLng AND :maxLng
    """)
    List<Station> findActiveInBounds(BigDecimal minLat, BigDecimal maxLat, BigDecimal minLng, BigDecimal maxLng);

    @Query("""
        SELECT s FROM Station s
        WHERE s.active = true
          AND (LOWER(s.name) LIKE LOWER(CONCAT('%', :query, '%'))
               OR s.stationNumber LIKE CONCAT('%', :query, '%'))
    """)
    List<Station> searchActiveByNameOrNumber(String query);

    List<Station> findByActiveTrue();
}
