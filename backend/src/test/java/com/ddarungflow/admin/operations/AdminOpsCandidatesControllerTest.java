package com.ddarungflow.admin.operations;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Current candidates are sourced from the same bounded {@code admin_ops_runtime_risk_snapshots}
 * (TASK-277) that OPS-02's risk map creates and OPS-01's dashboard already reuses — never from
 * {@code prediction_batches}/{@code station_predictions}. Tests build snapshots directly via
 * {@link #insertSnapshot} and pass the resulting id as {@code snapshotId}, the same handoff the
 * real risk-map page performs.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AdminOpsCandidatesControllerTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired UsersRepository users;
    @BeforeEach void clear() {
        jdbc.update("DELETE FROM admin_ops_runtime_risk_snapshots");
        jdbc.update("DELETE FROM station_predictions"); jdbc.update("DELETE FROM prediction_batches");
        jdbc.update("DELETE FROM station_inventory_current"); jdbc.update("DELETE FROM station_rhythm_profiles");
        jdbc.update("DELETE FROM stations"); users.deleteAll();
    }

    @Test void enforcesPermissionAndValidatesQuery() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/candidates")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/candidates").with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/candidates").with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        mvc.perform(get("/api/v1/admin/ops/candidates?horizonMinutes=30").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_HORIZON"));
        mvc.perform(get("/api/v1/admin/ops/candidates?riskType=RETURN").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_RISK_TYPE"));
        mvc.perform(get("/api/v1/admin/ops/candidates?riskType=COMBINED").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_RISK_TYPE"));
        mvc.perform(get("/api/v1/admin/ops/candidates?requiredBikeCount=0").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?limit=0").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?limit=501").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=not-a-uuid").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + UUID.randomUUID()).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?limit=500").with(allowed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.ruleVersion").value("OPS_CANDIDATE_RENTAL_V1"));
    }

    @Test void reportsAnalysisScopeRequiredBeforeAnyMapScopeHasBeenAnalyzed() throws Exception {
        // No admin_ops_runtime_risk_snapshots row and no legacy prediction_batches row either — the
        // regression case: this must not silently join a citywide legacy batch, and must not report
        // a confirmed zero for counts nobody has actually measured.
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        mvc.perform(get("/api/v1/admin/ops/candidates").with(allowed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.limitations", org.hamcrest.Matchers.hasItem("ANALYSIS_SCOPE_REQUIRED")))
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.coverage.eligibleCandidateCount").value(0))
                .andExpect(jsonPath("$.coverage.analyzedStationCount").doesNotExist())
                .andExpect(jsonPath("$.coverage.analysisNormalCount").doesNotExist())
                .andExpect(jsonPath("$.coverage.profileAvailableCount").doesNotExist())
                .andExpect(jsonPath("$.capabilities.rentalRisk.source").value("private_on_demand_inference"));
    }

    @Test void expiredSnapshotIsReportedAsAnExpiredAnalysisNotAScopeRequiredState() throws Exception {
        String snapshotId = insertSnapshot(OffsetDateTime.now(), 60, 1, item("A", "1001", 0, "NORMAL", OffsetDateTime.now().plusMinutes(60), .5, .5, .5, .5, .5));
        jdbc.update("UPDATE admin_ops_runtime_risk_snapshots SET expires_at = ? WHERE snapshot_id = ?", OffsetDateTime.now().minusSeconds(1), UUID.fromString(snapshotId));
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + snapshotId).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RISK_SNAPSHOT_EXPIRED"));
    }

    @Test void ranksEligibleItemsFromASnapshotPaginatesAndKeepsSourceGapsExplicit() throws Exception {
        OffsetDateTime target1 = OffsetDateTime.now().plusMinutes(60); OffsetDateTime target2 = target1.plusMinutes(5);
        String snapshotId = insertSnapshot(OffsetDateTime.now(), 60, 1,
                item("C1", "1001", 3, "NORMAL", target1, .20, .20, .20, .20, .20),
                item("C2", "1002", 2, "NORMAL", target2, .20, .20, .20, .20, .20),
                item("C3", "1003", 1, "NORMAL", target2, .60, .60, .60, .60, .60));
        insertProfile("C1", "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":0,\"sampleCount\":20,\"medianBikeCount\":2,\"stockoutRate\":0.1}],\"stockout\":{\"episodeCount\":3,\"medianDurationMinutes\":4,\"p90DurationMinutes\":7,\"medianRecoveryMinutesToThree\":2}}");
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        MvcResult first = mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + snapshotId + "&limit=2").with(allowed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("NORMAL"))
                .andExpect(jsonPath("$.items[0].rank").value(1)).andExpect(jsonPath("$.items[0].station.stationNumber").value("1001"))
                .andExpect(jsonPath("$.items[1].station.stationNumber").value("1002")).andExpect(jsonPath("$.ruleVersion").value("OPS_CANDIDATE_RENTAL_V1"))
                .andExpect(jsonPath("$.items[0].ruleVersion").value("OPS_CANDIDATE_RENTAL_V1"))
                .andExpect(jsonPath("$.items[0].station.capacity").isEmpty()).andExpect(jsonPath("$.capabilities.usageScale.available").value(false))
                .andExpect(jsonPath("$.capabilities.nearbyAlternatives.available").value(false)).andExpect(jsonPath("$..stationId").doesNotExist())
                .andExpect(jsonPath("$.coverage.analysisNormalCount").value(3)).andExpect(jsonPath("$.coverage.profileAvailableCount").value(1)).andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor"); String reference = JsonPath.read(first.getResponse().getContentAsString(), "$.referenceTime");
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + snapshotId + "&limit=2&cursor=" + cursor).with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.referenceTime").value(reference))
                .andExpect(jsonPath("$.items[0].rank").value(3)).andExpect(jsonPath("$.items[0].station.stationNumber").value("1003"));
        mvc.perform(get("/api/v1/admin/ops/candidates?requiredBikeCount=2&snapshotId=" + snapshotId + "&cursor=" + cursor).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        String otherSnapshot = insertSnapshot(OffsetDateTime.now(), 60, 1, item("D1", "9001", 1, "NORMAL", target1, .5, .5, .5, .5, .5));
        // A filter (here: a different snapshot) must not accept a cursor minted under a different one.
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + otherSnapshot + "&cursor=" + cursor).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void excludesNonNormalItemsButAllowsZeroBikes() throws Exception {
        OffsetDateTime target = OffsetDateTime.now().plusMinutes(60);
        String snapshotId = insertSnapshot(OffsetDateTime.now(), 60, 1,
                item("ZERO", "2001", 0, "NORMAL", target, .5, .5, .5, .5, .5),
                item("DELAYED", "2002", 1, "DELAYED", null, 0, 0, 0, 0, 0),
                item("MISSING", "2003", 1, "MISSING", null, 0, 0, 0, 0, 0),
                item("UNAVAILABLE", "2004", 1, "UNAVAILABLE", null, 0, 0, 0, 0, 0),
                item("INSUFFICIENT", "2005", 1, "INSUFFICIENT_DATA", null, 0, 0, 0, 0, 0));
        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + snapshotId).with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ))))).andExpect(status().isOk())
                .andExpect(jsonPath("$.dataState").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].station.stationNumber").value("2001")).andExpect(jsonPath("$.items[0].station.currentBikes").value(0));
    }

    @Test void supportsApprovedHorizonsAndRequiredBikeCountsFromAMatchingSnapshot() throws Exception {
        OffsetDateTime target = OffsetDateTime.now().plusMinutes(120);
        String snapshotId = insertSnapshot(OffsetDateTime.now(), 120, 3,
                item("H1", "3001", 2, "NORMAL", target, .10, .20, .30, .40, .50));
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        mvc.perform(get("/api/v1/admin/ops/candidates?horizonMinutes=120&requiredBikeCount=3&snapshotId=" + snapshotId).with(allowed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.horizonMinutes").value(120)).andExpect(jsonPath("$.requiredBikeCount").value(3))
                .andExpect(jsonPath("$.items[0].prediction.selectedRequiredBikeCount").value(3))
                .andExpect(jsonPath("$.items[0].prediction.selectedShortageProbability").value(0.7));
        // The header's horizon/required is frozen at analysis time; a live query for a different
        // combination must not silently reuse it.
        mvc.perform(get("/api/v1/admin/ops/candidates?horizonMinutes=60&requiredBikeCount=3&snapshotId=" + snapshotId).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?horizonMinutes=120&requiredBikeCount=1&snapshotId=" + snapshotId).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void reportsPresentMissingInvalidAndInsufficientRecurrenceWithoutExposingStationIds() throws Exception {
        OffsetDateTime target = OffsetDateTime.now().plusMinutes(60);
        String snapshotId = insertSnapshot(OffsetDateTime.now(), 60, 1,
                item("PRESENT", "4001", 1, "NORMAL", target, .90, .90, .90, .90, .90),
                item("MISSING", "4002", 1, "NORMAL", target, .80, .80, .80, .80, .80),
                item("INVALID", "4003", 1, "NORMAL", target, .70, .70, .70, .70, .70),
                item("INSUFFICIENT", "4004", 1, "NORMAL", target, .60, .60, .60, .60, .60));
        insertProfile("PRESENT", fullProfilePayload());
        insertProfile("INVALID", "{bad json");
        insertProfile("INSUFFICIENT", "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":0,\"sampleCount\":9,\"medianBikeCount\":2,\"stockoutRate\":0.2}],\"stockout\":{\"episodeCount\":1}}");

        mvc.perform(get("/api/v1/admin/ops/candidates?snapshotId=" + snapshotId + "&limit=4").with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].recurrence.reasonCode").value("RECURRENCE_CELL_INSUFFICIENT"))
                .andExpect(jsonPath("$.items[1].recurrence.reasonCode").value("RECURRENCE_PROFILE_INVALID"))
                .andExpect(jsonPath("$.items[2].recurrence.reasonCode").value("RECURRENCE_PROFILE_MISSING"))
                .andExpect(jsonPath("$.items[3].recurrence.available").value(true))
                .andExpect(jsonPath("$..stationId").doesNotExist());
    }

    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) { Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("ops").role(role).build()); PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions); return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()); }
    private void insertStation(String id, String number) { OffsetDateTime now = OffsetDateTime.now(); jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, number, id, 37.5, 127.0, true, now, now); }
    private void insertProfile(String stationId, String payload) { OffsetDateTime now = OffsetDateTime.now(); jdbc.update("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (?, ?, ?, ?, ?, ?)", stationId, java.time.LocalDate.of(2026, 8, 1), java.time.LocalDate.of(2026, 8, 28), 100, payload, now); }
    private String fullProfilePayload() { StringBuilder cells = new StringBuilder(); for (int day = 1; day <= 7; day++) for (int hour = 0; hour < 24; hour++) { if (!cells.isEmpty()) cells.append(','); cells.append("{\"dayOfWeek\":").append(day).append(",\"hourOfDay\":").append(hour).append(",\"sampleCount\":10,\"medianBikeCount\":2,\"stockoutRate\":0.2}"); } return "{\"weekdayHourly\":[" + cells + "],\"stockout\":{\"episodeCount\":1}}"; }

    /** One snapshot item: dataState "NORMAL" carries real atLeast1..5; any other dataState carries none. */
    private record ItemSpec(String id, String number, Integer currentBikes, String dataState, OffsetDateTime target, double a1, double a2, double a3, double a4, double a5) { }
    private ItemSpec item(String id, String number, Integer currentBikes, String dataState, OffsetDateTime target, double a1, double a2, double a3, double a4, double a5) {
        return new ItemSpec(id, number, currentBikes, dataState, target, a1, a2, a3, a4, a5);
    }

    /** Builds one admin_ops_runtime_risk_snapshots row (2-minute TTL from now) plus its items, and a matching `stations` row per item so profile joins and coverage counts behave like the real risk-map write path. Returns the new snapshot id. */
    private String insertSnapshot(OffsetDateTime referenceTime, int horizonMinutes, int requiredBikeCount, ItemSpec... specs) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        int ordinal = 1;
        long normalCount = 0;
        for (ItemSpec spec : specs) {
            insertStation(spec.id(), spec.number());
            boolean normal = "NORMAL".equals(spec.dataState());
            if (normal) normalCount++;
            jdbc.update("""
                    INSERT INTO admin_ops_runtime_risk_snapshot_items
                      (snapshot_id, ordinal, station_number, station_name, latitude, longitude, current_bikes, data_state,
                       at_least_1_probability, at_least_2_probability, at_least_3_probability, at_least_4_probability, at_least_5_probability,
                       selected_shortage_probability, risk_band, prediction_target_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, id, ordinal++, spec.number(), spec.id(), new BigDecimal("37.5"), new BigDecimal("127.0"), spec.currentBikes(), spec.dataState(),
                    normal ? spec.a1() : null, normal ? spec.a2() : null, normal ? spec.a3() : null, normal ? spec.a4() : null, normal ? spec.a5() : null,
                    (Object) null, (Object) null, normal ? spec.target() : null);
        }
        jdbc.update("""
                INSERT INTO admin_ops_runtime_risk_snapshots
                  (snapshot_id, created_at, expires_at, reference_time, horizon_minutes, required_bike_count,
                   min_lng, min_lat, max_lng, max_lat, data_state_filter, model_version,
                   eligible_station_count, evaluated_station_count, normal_inference_success_count)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, id, now, now.plusMinutes(2), referenceTime, horizonMinutes, requiredBikeCount,
                new BigDecimal("126.9"), new BigDecimal("37.4"), new BigDecimal("127.1"), new BigDecimal("37.6"),
                (Object) null, "model", specs.length, specs.length, normalCount);
        return id.toString();
    }
}
