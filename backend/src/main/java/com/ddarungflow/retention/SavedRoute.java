package com.ddarungflow.retention;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "saved_routes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedRoute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "start_station_id", nullable = false)
    private Long startStationId;

    @Column(name = "start_station_name", length = 150)
    private String startStationName;

    @Column(name = "end_station_id", nullable = false)
    private Long endStationId;

    @Column(name = "end_station_name", length = 150)
    private String endStationName;

    @Column(name = "travel_mode", length = 50)
    private String travelMode;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }
    }

    @Builder
    public SavedRoute(Long userId, String name, Long startStationId, String startStationName,
                      Long endStationId, String endStationName, String travelMode) {
        this.userId = userId;
        this.name = name;
        this.startStationId = startStationId;
        this.startStationName = startStationName;
        this.endStationId = endStationId;
        this.endStationName = endStationName;
        this.travelMode = travelMode;
    }
}
