package com.ddarungflow.entity;
import com.fasterxml.jackson.databind.JsonNode; import jakarta.persistence.*; import org.hibernate.annotations.JdbcTypeCode; import org.hibernate.type.SqlTypes; import java.time.*;
@Entity @Table(name="station_rhythm_profiles") public class StationRhythmProfile {
 @Id @Column(name="station_id") private String stationId; @Column(name="window_start") private LocalDate windowStart; @Column(name="window_end") private LocalDate windowEnd; @Column(name="sample_count") private long sampleCount; @JdbcTypeCode(SqlTypes.JSON) @Column(name="payload", nullable=false, columnDefinition="jsonb") private JsonNode payload; @Column(name="generated_at") private OffsetDateTime generatedAt;
 public String getStationId(){return stationId;} public LocalDate getWindowStart(){return windowStart;} public LocalDate getWindowEnd(){return windowEnd;} public long getSampleCount(){return sampleCount;} public JsonNode getPayload(){return payload;} public OffsetDateTime getGeneratedAt(){return generatedAt;}
}
