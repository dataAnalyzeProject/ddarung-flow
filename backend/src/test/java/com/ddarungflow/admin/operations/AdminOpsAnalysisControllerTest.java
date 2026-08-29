package com.ddarungflow.admin.operations;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AdminOpsAnalysisControllerTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired UsersRepository users;
    @BeforeEach void clear() { jdbc.update("DELETE FROM station_predictions"); jdbc.update("DELETE FROM prediction_batches"); jdbc.update("DELETE FROM station_inventory_current"); jdbc.update("DELETE FROM station_rhythm_profiles"); jdbc.update("DELETE FROM stations"); users.deleteAll(); }

    @Test void enforcesPermissionAndRejectsUnsupportedOrDeferredQueries() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/analysis")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/analysis").with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/analysis").with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_ANALYSIS_READ)));
        mvc.perform(get("/api/v1/admin/ops/analysis?view=DISTRICT").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_ANALYSIS_VIEW"));
        mvc.perform(get("/api/v1/admin/ops/analysis?riskType=RETURN").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_RISK_TYPE"));
        mvc.perform(get("/api/v1/admin/ops/analysis?period=7").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/analysis?dimension=district").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void selectsLargestWindowAndReturnsWeightedFixedBuckets() throws Exception {
        insertProfile("A", "1001", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 28), "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":8,\"sampleCount\":10,\"medianBikeCount\":2,\"stockoutRate\":0.2}],\"stockout\":{\"episodeCount\":1}}");
        insertProfile("B", "1002", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 28), "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":8,\"sampleCount\":30,\"medianBikeCount\":3,\"stockoutRate\":0.6}],\"stockout\":{\"episodeCount\":2}}");
        insertProfile("C", "1003", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 28), "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":8,\"sampleCount\":20,\"medianBikeCount\":1,\"stockoutRate\":1.0}],\"stockout\":{\"episodeCount\":3}}");
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_ANALYSIS_READ)));
        mvc.perform(get("/api/v1/admin/ops/analysis").with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.view").value("WEEKDAY"))
                .andExpect(jsonPath("$.metric").value("OBSERVED_STOCKOUT_RATE")).andExpect(jsonPath("$.ruleVersion").value("OPS_ANALYSIS_STOCKOUT_V1")).andExpect(jsonPath("$.windowRuleVersion").value("OPS_ANALYSIS_WINDOW_V1"))
                .andExpect(jsonPath("$.selectedWindowProfileCount").value(2)).andExpect(jsonPath("$.excludedDifferentWindowProfileCount").value(1))
                .andExpect(jsonPath("$.limitations").value(org.hamcrest.Matchers.hasItem("PROFILE_WINDOW_MISMATCH"))).andExpect(jsonPath("$.buckets.length()").value(7))
                .andExpect(jsonPath("$.buckets[0].key").value(1)).andExpect(jsonPath("$.buckets[0].sampleCount").value(40)).andExpect(jsonPath("$.buckets[0].observedStockoutRate").value(0.5))
                .andExpect(jsonPath("$.buckets[1].observedStockoutRate").isEmpty()).andExpect(jsonPath("$.weekdayHourCells.length()").value(168)).andExpect(jsonPath("$..stationId").doesNotExist());
        mvc.perform(get("/api/v1/admin/ops/analysis?view=HOUR").with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.buckets.length()").value(24)).andExpect(jsonPath("$.buckets[8].observedStockoutRate").value(0.5));
    }

    @Test void reportsInsufficientDataAndPartialInvalidProfilesTruthfully() throws Exception {
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_ANALYSIS_READ)));
        insertStation("EMPTY", "2001");
        mvc.perform(get("/api/v1/admin/ops/analysis").with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.dataState").value("INSUFFICIENT_DATA")).andExpect(jsonPath("$.coverage.profileCoverageRate").value(0.0));
        insertProfile("BAD", "2002", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 28), "{bad json");
        insertProfile("GOOD", "2003", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 28), "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":0,\"sampleCount\":10,\"medianBikeCount\":1,\"stockoutRate\":0.2}],\"stockout\":{\"episodeCount\":1}}");
        mvc.perform(get("/api/v1/admin/ops/analysis").with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.dataState").value("NORMAL")).andExpect(jsonPath("$.limitations").value(org.hamcrest.Matchers.hasItem("PROFILE_PARTIAL_INVALID")));
    }
    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) { Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("ops").role(role).build()); PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions); return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()); }
    private void insertStation(String id, String number) { OffsetDateTime now = OffsetDateTime.now(); jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, number, id, 37.5, 127.0, true, now, now); }
    private void insertProfile(String id, String number, LocalDate start, LocalDate end, String payload) { insertStation(id, number); jdbc.update("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (?, ?, ?, ?, ?, ?)", id, start, end, 100, payload, OffsetDateTime.now()); }
}
