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

import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AdminOpsCandidatesControllerTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired UsersRepository users;
    @BeforeEach void clear() { jdbc.update("DELETE FROM station_predictions"); jdbc.update("DELETE FROM prediction_batches"); jdbc.update("DELETE FROM station_inventory_current"); jdbc.update("DELETE FROM station_rhythm_profiles"); jdbc.update("DELETE FROM stations"); users.deleteAll(); }

    @Test void enforcesPermissionAndValidatesQuery() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/candidates")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/candidates").with(authentication(auth(UserRole.USER, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/candidates").with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        mvc.perform(get("/api/v1/admin/ops/candidates?horizonMinutes=30").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_HORIZON"));
        mvc.perform(get("/api/v1/admin/ops/candidates?riskType=RETURN").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_RISK_TYPE"));
        mvc.perform(get("/api/v1/admin/ops/candidates?requiredBikeCount=0").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/candidates?limit=501").with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void ranksEligibleRowsPaginatesAndKeepsSourceGapsExplicit() throws Exception {
        OffsetDateTime now = OffsetDateTime.now(); insertEligible("C1", "1001", now, 0.20); insertEligible("C2", "1002", now.plusMinutes(5), 0.20); insertEligible("C3", "1003", now.plusMinutes(5), 0.60);
        insertProfile("C1", "{\"weekdayHourly\":[{\"dayOfWeek\":1,\"hourOfDay\":0,\"sampleCount\":20,\"medianBikeCount\":2,\"stockoutRate\":0.1}],\"stockout\":{\"episodeCount\":3,\"medianDurationMinutes\":4,\"p90DurationMinutes\":7,\"medianRecoveryMinutesToThree\":2}}");
        var allowed = authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ)));
        MvcResult first = mvc.perform(get("/api/v1/admin/ops/candidates?limit=2").with(allowed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].rank").value(1)).andExpect(jsonPath("$.items[0].station.stationNumber").value("1001"))
                .andExpect(jsonPath("$.items[1].station.stationNumber").value("1002")).andExpect(jsonPath("$.items[0].ruleVersion").value("OPS_CANDIDATE_RENTAL_V1"))
                .andExpect(jsonPath("$.items[0].station.capacity").isEmpty()).andExpect(jsonPath("$.capabilities.usageScale.available").value(false))
                .andExpect(jsonPath("$.capabilities.nearbyAlternatives.available").value(false)).andExpect(jsonPath("$..stationId").doesNotExist()).andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor"); String reference = JsonPath.read(first.getResponse().getContentAsString(), "$.referenceTime");
        mvc.perform(get("/api/v1/admin/ops/candidates?limit=2&cursor=" + cursor).with(allowed)).andExpect(status().isOk()).andExpect(jsonPath("$.referenceTime").value(reference))
                .andExpect(jsonPath("$.items[0].rank").value(3)).andExpect(jsonPath("$.items[0].station.stationNumber").value("1003"));
        mvc.perform(get("/api/v1/admin/ops/candidates?requiredBikeCount=2&cursor=" + cursor).with(allowed)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test void excludesNonNormalSourcesButAllowsZeroBikes() throws Exception {
        OffsetDateTime now = OffsetDateTime.now(); insertEligible("ZERO", "2001", now, 0.5); insertStation("STALE", "2002"); jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", "STALE", 1, now.minusMinutes(31), "NORMAL", now);
        mvc.perform(get("/api/v1/admin/ops/candidates").with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_CANDIDATE_READ))))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].station.stationNumber").value("2001")).andExpect(jsonPath("$.items[0].station.currentBikes").value(0));
    }
    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) { Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("ops").role(role).build()); PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions); return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()); }
    private void insertStation(String id, String number) { OffsetDateTime now = OffsetDateTime.now(); jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, number, id, 37.5, 127.0, true, now, now); }
    private void insertEligible(String id, String number, OffsetDateTime target, double atLeast) { OffsetDateTime now = OffsetDateTime.now(); insertStation(id, number); jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", id, 0, now, "NORMAL", now); UUID batch = UUID.randomUUID(); jdbc.update("INSERT INTO prediction_batches (batch_id, created_at, expires_at, feature_as_of, generated_at, model_version, publish_status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", batch, now, now.plusHours(2), now, now, "model", "ACTIVE", now); jdbc.update("INSERT INTO station_predictions (batch_id, station_id, prediction_target_at, horizon_minutes, at_least_1_probability, at_least_2_probability, at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?)", batch, id, target.plusMinutes(60), 60, atLeast, atLeast, atLeast, atLeast, atLeast, now); }
    private void insertProfile(String stationId, String payload) { OffsetDateTime now = OffsetDateTime.now(); jdbc.update("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (?, ?, ?, ?, ?, ?)", stationId, java.time.LocalDate.of(2026, 8, 1), java.time.LocalDate.of(2026, 8, 28), 100, payload, now); }
}
