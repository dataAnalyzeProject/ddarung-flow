package com.ddarungflow.entity;
import jakarta.persistence.*; import java.time.*;
@Entity @Table(name="station_rhythm_profiles") public class StationRhythmProfile {
 @Id @Column(name="station_id") private String stationId; @Column(name="window_start") private LocalDate windowStart; @Column(name="window_end") private LocalDate windowEnd; @Column(name="sample_count") private long sampleCount; @Column(name="payload", columnDefinition="jsonb") private String payload; @Column(name="generated_at") private OffsetDateTime generatedAt;
 public String getStationId(){return stationId;} public LocalDate getWindowStart(){return windowStart;} public LocalDate getWindowEnd(){return windowEnd;} public long getSampleCount(){return sampleCount;} public String getPayload(){return payload;}
}
