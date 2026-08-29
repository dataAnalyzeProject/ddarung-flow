package com.ddarungflow.admin.operations;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Repository
public class AdminOpsAnalysisRepository {
    private final JdbcTemplate jdbc;
    public AdminOpsAnalysisRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public long activePublicStationCount() { Long count = jdbc.queryForObject("SELECT COUNT(*) FROM stations WHERE active = TRUE AND station_number IS NOT NULL", Long.class); return count == null ? 0 : count; }
    public List<ProfileRow> findActivePublicProfiles() {
        return jdbc.query("""
                SELECT s.station_number, p.window_start, p.window_end, p.payload, p.generated_at
                FROM stations s JOIN station_rhythm_profiles p ON p.station_id = s.station_id
                WHERE s.active = TRUE AND s.station_number IS NOT NULL
                """, (rs, row) -> map(rs));
    }
    private ProfileRow map(ResultSet rs) throws java.sql.SQLException { return new ProfileRow(rs.getString("station_number"), rs.getObject("window_start", LocalDate.class), rs.getObject("window_end", LocalDate.class), rs.getString("payload"), rs.getObject("generated_at", OffsetDateTime.class)); }
    public record ProfileRow(String stationNumber, LocalDate windowStart, LocalDate windowEnd, String payload, OffsetDateTime generatedAt) { }
}
