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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminOpsControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UsersRepository users;

    @BeforeEach
    void clear() {
        jdbc.update("DELETE FROM station_predictions");
        jdbc.update("DELETE FROM prediction_batches");
        jdbc.update("DELETE FROM station_inventory_current");
        jdbc.update("DELETE FROM station_rhythm_profiles");
        jdbc.update("DELETE FROM stations");
        users.deleteAll();
    }

    @Test
    void enforcesExistingAdminAndFineGrainedPermissionGates() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/overview"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/overview").with(authentication(authToken(UserRole.USER, Set.of()))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/overview").with(authentication(authToken(UserRole.ADMIN, Set.of()))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/overview").with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_DASHBOARD_READ)))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/ops/risk-stations").with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/ops/risk-stations/1001"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations/1001").with(authentication(authToken(UserRole.USER, Set.of()))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test
    void returnsPublicStationRiskAndUsesNearestEligiblePrediction() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertStation("ST-1", "1001", "테스트 대여소", true);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)",
                "ST-1", 0, now.minusMinutes(30), "NORMAL", now);
        UUID batch = insertBatch("ACTIVE", now.minusMinutes(5), now.plusHours(2));
        insertPrediction(batch, "ST-1", now.plusMinutes(60), 0.60, 0.50, 0.40, 0.30, 0.20);
        insertPrediction(batch, "ST-1", now.plusMinutes(90), 0.10, 0.10, 0.10, 0.10, 0.10);

        mvc.perform(get("/api/v1/admin/ops/risk-stations?horizonMinutes=60&requiredBikeCount=1")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].station.stationNumber").value("1001"))
                .andExpect(jsonPath("$.items[0].station.currentBikes").value(0))
                .andExpect(jsonPath("$.items[0].station.capacity").isEmpty())
                .andExpect(jsonPath("$.items[0].rentalRisk.atLeast1Probability").value(0.6))
                .andExpect(jsonPath("$.items[0].rentalRisk.shortage1Probability").value(0.4))
                .andExpect(jsonPath("$.items[0].riskBand").value("WATCH"))
                .andExpect(jsonPath("$.capabilities.returnRisk.available").value(false))
                .andExpect(jsonPath("$.capabilities.stationCapacity.available").value(false))
                .andExpect(jsonPath("$.ruleVersion").value("OPS_RENTAL_RISK_V1"))
                .andExpect(jsonPath("$..stationId").doesNotExist())
                .andExpect(jsonPath("$..batchId").doesNotExist());
        mvc.perform(get("/api/v1/admin/ops/risk-stations/1001")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.station.station.stationNumber").value("1001"))
                .andExpect(jsonPath("$.returnRisk").isEmpty());
        mvc.perform(get("/api/v1/admin/ops/overview")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_DASHBOARD_READ)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rentalRiskSummary.watchCount").value(1))
                .andExpect(jsonPath("$.returnRisk").isEmpty());
    }

    @Test
    void reportsInsufficientDataOnlyWhenInventoryIsNormalAndValidatesParameters() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertStation("ST-2", "1002", "예측 없음", true);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)",
                "ST-2", 1, now.minusMinutes(31), "NORMAL", now);
        insertStation("ST-3", "1003", "재고 없음", true);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)",
                "ST-3", null, now.minusMinutes(1), "MISSING", now);

        mvc.perform(get("/api/v1/admin/ops/risk-stations?dataState=DELAYED")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].station.stationNumber").value("1002"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?requiredBikeCount=0")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?horizonMinutes=30")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_HORIZON"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=127,37,126,38")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void paginationUsesAStableRiskAndStationNumberCursor() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        insertStation("ST-4", "1004", "첫 대여소", true);
        insertStation("ST-5", "1005", "둘째 대여소", true);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", "ST-4", 1, now, "NORMAL", now);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", "ST-5", 1, now, "NORMAL", now);
        UUID batch = insertBatch("ACTIVE", now.minusMinutes(1), now.plusHours(1));
        insertPrediction(batch, "ST-4", now.plusMinutes(60), 0.20, 0.20, 0.20, 0.20, 0.20);
        insertPrediction(batch, "ST-5", now.plusMinutes(60), 0.60, 0.60, 0.60, 0.60, 0.60);

        MvcResult first = mvc.perform(get("/api/v1/admin/ops/risk-stations?limit=1")
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].station.stationNumber").value("1004")).andReturn();
        String firstBody = first.getResponse().getContentAsString();
        String cursor = JsonPath.read(firstBody, "$.nextCursor");
        String referenceTime = JsonPath.read(firstBody, "$.referenceTime");
        mvc.perform(get("/api/v1/admin/ops/risk-stations?limit=1&cursor=" + cursor)
                        .with(authentication(authToken(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].station.stationNumber").value("1005"))
                .andExpect(jsonPath("$.referenceTime").value(referenceTime));
    }

    private UsernamePasswordAuthenticationToken authToken(UserRole role, Set<AdminPermission> permissions) {
        Users user = users.save(Users.builder().provider("google").providerUserId("ops-" + UUID.randomUUID()).displayName("ops").role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
    private void insertStation(String id, String number, String name, boolean active) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, number, name, 37.5, 127.0, active, now, now);
    }
    private UUID insertBatch(String status, OffsetDateTime generatedAt, OffsetDateTime expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO prediction_batches (batch_id, created_at, expires_at, feature_as_of, generated_at, model_version, publish_status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, generatedAt, expiresAt, generatedAt, generatedAt, "model", status, generatedAt);
        return id;
    }
    private void insertPrediction(UUID batch, String station, OffsetDateTime target, double one, double two, double three, double four, double five) {
        jdbc.update("INSERT INTO station_predictions (batch_id, station_id, prediction_target_at, horizon_minutes, at_least_1_probability, at_least_2_probability, at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_status, created_at) VALUES (?, ?, ?, 60, ?, ?, ?, ?, ?, 'NORMAL', ?)",
                batch, station, target, one, two, three, four, five, OffsetDateTime.now());
    }
}
