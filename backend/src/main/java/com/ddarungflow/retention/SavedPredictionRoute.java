package com.ddarungflow.retention;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "saved_prediction_routes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedPredictionRoute {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name="user_id", nullable=false) private Long userId;
    @Column(nullable=false, length=20) private String kind;
    @Column(name="display_name", nullable=false) private String displayName;
    @Column(name="origin_name", nullable=false) private String originName;
    @Column(name="origin_latitude", nullable=false, precision=10, scale=7) private BigDecimal originLatitude;
    @Column(name="origin_longitude", nullable=false, precision=10, scale=7) private BigDecimal originLongitude;
    @Column(name="destination_name") private String destinationName;
    @Column(name="destination_latitude", precision=10, scale=7) private BigDecimal destinationLatitude;
    @Column(name="destination_longitude", precision=10, scale=7) private BigDecimal destinationLongitude;
    @Column(name="station_id") private String stationId;
    @Column(name="travel_mode", nullable=false) private String travelMode;
    @Column(name="direct_minutes") private Integer directMinutes;
    @Column(name="required_bike_count", nullable=false) private Integer requiredBikeCount;
    @Column(name="route_key", nullable=false) private String routeKey;
    @Column(name="created_at", nullable=false, updatable=false) private OffsetDateTime createdAt;
    @PrePersist void prePersist(){ if(createdAt==null) createdAt=OffsetDateTime.now(); }
    @Builder public SavedPredictionRoute(Long userId,String kind,String displayName,String originName,BigDecimal originLatitude,BigDecimal originLongitude,String destinationName,BigDecimal destinationLatitude,BigDecimal destinationLongitude,String stationId,String travelMode,Integer directMinutes,Integer requiredBikeCount,String routeKey){this.userId=userId;this.kind=kind;this.displayName=displayName;this.originName=originName;this.originLatitude=originLatitude;this.originLongitude=originLongitude;this.destinationName=destinationName;this.destinationLatitude=destinationLatitude;this.destinationLongitude=destinationLongitude;this.stationId=stationId;this.travelMode=travelMode;this.directMinutes=directMinutes;this.requiredBikeCount=requiredBikeCount;this.routeKey=routeKey;}
}
