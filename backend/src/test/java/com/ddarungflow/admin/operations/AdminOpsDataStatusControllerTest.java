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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import java.util.UUID;

import static org.hamcrest.Matchers.contains;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminOpsDataStatusControllerTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired UsersRepository users;

    @BeforeEach void clear() {
        jdbc.update("DELETE FROM station_predictions");
        jdbc.update("DELETE FROM prediction_batches");
        jdbc.update("DELETE FROM station_inventory_current");
        jdbc.update("DELETE FROM station_rhythm_profiles");
        jdbc.update("DELETE FROM stations");
        users.deleteAll();
    }

    @Test void enforcesTheExistingAuthenticationAndPermissionContract() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/data-status"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/ops/data-status").with(authentication(auth(UserRole.USER, Set.of()))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/data-status").with(authentication(auth(UserRole.ADMIN, Set.of()))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_PERMISSION_DENIED"));
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(status().isOk());
    }

    @Test void returnsOnlyTheExactContractAndLeavesLegacyDataQualityAvailable() throws Exception {
        OffsetDateTime now = OffsetDateTime.now().withNano(0);
        insertStation("A", "1001", true); insertStation("B", "1002", true);
        insertInventory("A", now.minusMinutes(5), "NORMAL"); insertInventory("B", now.minusMinutes(8), "UNAVAILABLE");
        UUID batch = insertBatch(now.minusMinutes(10), now.minusMinutes(5), now.plusHours(1), "ACTIVE");
        insertPrediction(batch, "A"); insertPrediction(batch, "B");
        insertProfile("A", now.minusDays(1)); insertProfile("B", now.minusHours(2));

        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.*", hasSize(7)))
                .andExpect(jsonPath("$.inventory.*", hasSize(8)))
                .andExpect(jsonPath("$.prediction.*", hasSize(8)))
                .andExpect(jsonPath("$.profile.*", hasSize(5)))
                .andExpect(jsonPath("$.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.inventory.inventoryStatusBreakdown.NORMAL").value(1))
                .andExpect(jsonPath("$.inventory.inventoryStatusBreakdown.UNAVAILABLE").value(1))
                .andExpect(jsonPath("$.limitations", contains("AFFECTED_SCOPE_NOT_SOURCE_BACKED", "LAST_NORMAL_REFRESH_NOT_SOURCE_BACKED", "REASON_LEDGER_NOT_SOURCE_BACKED")))
                .andExpect(jsonPath("$..batchId").doesNotExist()).andExpect(jsonPath("$..modelVersion").doesNotExist())
                .andExpect(jsonPath("$..modelId").doesNotExist()).andExpect(jsonPath("$..artifact").doesNotExist())
                .andExpect(jsonPath("$..artifactPath").doesNotExist()).andExpect(jsonPath("$..sha").doesNotExist())
                .andExpect(jsonPath("$..affectedScope").doesNotExist()).andExpect(jsonPath("$..affectedStations").doesNotExist())
                .andExpect(jsonPath("$..reason").doesNotExist()).andExpect(jsonPath("$..failureReason").doesNotExist())
                .andExpect(jsonPath("$..lastNormalRefresh").doesNotExist()).andExpect(jsonPath("$..windowHours").doesNotExist())
                .andExpect(jsonPath("$..cpu").doesNotExist()).andExpect(jsonPath("$..ram").doesNotExist())
                .andExpect(jsonPath("$..uptime").doesNotExist()).andExpect(jsonPath("$..slo").doesNotExist())
                .andExpect(jsonPath("$..airflow").doesNotExist()).andExpect(jsonPath("$..oci").doesNotExist());
        mvc.perform(get("/api/v1/admin/data-quality").with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.DATA_STATUS_READ)))))
                .andExpect(status().isOk());
    }

    @Test void inventoryStateUsesCoverageAndTheApprovedDelayBoundaries() throws Exception {
        OffsetDateTime now = OffsetDateTime.now().withNano(0);
        insertStation("A", "1001", true); insertStation("B", "1002", true);
        insertInventory("A", now.minusMinutes(30), "NORMAL"); insertInventory("B", now.minusMinutes(30), "NORMAL");
        expectInventory("NORMAL", 30);
        jdbc.update("UPDATE station_inventory_current SET inventory_status = 'MISSING' WHERE station_id = 'B'");
        expectInventory("PARTIAL", 30);
        jdbc.update("UPDATE station_inventory_current SET inventory_status = 'UNAVAILABLE' WHERE station_id = 'B'");
        expectInventory("PARTIAL", 30);
        jdbc.update("UPDATE station_inventory_current SET inventory_status = 'NORMAL' WHERE station_id = 'B'");
        jdbc.update("UPDATE station_inventory_current SET collected_at = ?", now.minusMinutes(31));
        expectInventory("DELAYED", 31);
        jdbc.update("UPDATE station_inventory_current SET collected_at = ?", now.minusMinutes(180));
        expectInventory("DELAYED", 180);
        jdbc.update("UPDATE station_inventory_current SET collected_at = ?", now.minusMinutes(181));
        expectInventory("MISSING", 181);
        jdbc.update("DELETE FROM station_inventory_current WHERE station_id = 'B'");
        jdbc.update("UPDATE station_inventory_current SET collected_at = ? WHERE station_id = 'A'", now.minusMinutes(5));
        expectInventory("PARTIAL", 5);
        jdbc.update("UPDATE station_inventory_current SET collected_at = NULL");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inventory.dataState").value("MISSING"))
                .andExpect(jsonPath("$.inventory.p50DelayMinutes").doesNotExist())
                .andExpect(jsonPath("$.inventory.p95DelayMinutes").doesNotExist());
    }

    @Test void predictionSelectsOnlyTheNewestValidBatchAndReportsCoverageStates() throws Exception {
        OffsetDateTime now = OffsetDateTime.now().withNano(0);
        insertStation("A", "1001", true); insertStation("B", "1002", true);
        insertInventory("A", now.minusMinutes(1), "NORMAL"); insertInventory("B", now.minusMinutes(1), "NORMAL");
        insertProfile("A", now); insertProfile("B", now);
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction").doesNotExist()).andExpect(jsonPath("$.dataState").value("MISSING"));
        UUID expired = insertBatch(now.minusHours(2), now.minusHours(2), now.minusMinutes(1), "ACTIVE"); insertPrediction(expired, "A");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction").doesNotExist()).andExpect(jsonPath("$.dataState").value("MISSING"));
        UUID future = insertBatch(now.plusMinutes(1), now.plusMinutes(1), now.plusHours(2), "ACTIVE"); insertPrediction(future, "A");
        UUID inactive = insertBatch(now.minusMinutes(1), now.minusMinutes(1), now.plusHours(2), "INACTIVE"); insertPrediction(inactive, "A");
        UUID older = insertBatch(now.minusMinutes(10), now.minusMinutes(10), now.plusHours(2), "ACTIVE"); insertPrediction(older, "A");
        UUID lowerStableIdentity = new UUID(0, 1);
        UUID newest = new UUID(0, 2);
        insertBatch(lowerStableIdentity, now.minusMinutes(2), now.minusMinutes(2), now.plusHours(2), "ACTIVE");
        insertPrediction(lowerStableIdentity, "A");
        insertBatch(newest, now.minusMinutes(2), now.minusMinutes(2), now.plusHours(2), "ACTIVE");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.prediction.predictionRowCount").value(0))
                .andExpect(jsonPath("$.prediction.featureAsOf").value(apiTimestamp(now.minusMinutes(2))));
        insertPrediction(newest, "A");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.prediction.predictedStationCount").value(1))
                .andExpect(jsonPath("$.prediction.coverageRatio").value(0.5));
        insertPrediction(newest, "B");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction.dataState").value("NORMAL"))
                .andExpect(jsonPath("$.prediction.predictedStationCount").value(2));
    }

    @Test void profileUsesOnlyActivePublicStationsAndRootPrecedenceIsExact() throws Exception {
        OffsetDateTime now = OffsetDateTime.now().withNano(0);
        insertStation("A", "1001", true); insertStation("B", null, true); insertStation("C", "1003", false);
        insertInventory("A", now.minusMinutes(31), "NORMAL"); insertInventory("B", now.minusMinutes(31), "NORMAL");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.inventory.dataState").value("DELAYED"))
                .andExpect(jsonPath("$.prediction").doesNotExist())
                .andExpect(jsonPath("$.dataState").value("MISSING"));
        UUID batch = insertBatch(now.minusMinutes(1), now.minusMinutes(1), now.plusHours(1), "ACTIVE");
        insertPrediction(batch, "A"); insertPrediction(batch, "B");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.profile.activePublicStationCount").value(1))
                .andExpect(jsonPath("$.profile.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.dataState").value("DELAYED"));
        insertProfile("A", now.minusDays(2));
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.profile.dataState").value("NORMAL"))
                .andExpect(jsonPath("$.profile.latestGeneratedAt").value(apiTimestamp(now.minusDays(2))))
                .andExpect(jsonPath("$.dataState").value("DELAYED"));
        jdbc.update("UPDATE stations SET station_number = '1002' WHERE station_id = 'B'");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.profile.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.profile.coverageRatio").value(0.5))
                .andExpect(jsonPath("$.dataState").value("DELAYED"));
        jdbc.update("UPDATE station_inventory_current SET collected_at = ?", now.minusMinutes(1));
        jdbc.update("DELETE FROM station_predictions WHERE batch_id = ?", batch);
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.dataState").value("INSUFFICIENT_DATA"));
        insertPrediction(batch, "A");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.prediction.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.dataState").value("PARTIAL"));
        jdbc.update("DELETE FROM station_inventory_current WHERE station_id = 'A'");
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.inventory.dataState").value("PARTIAL"));
        jdbc.update("DELETE FROM station_predictions WHERE batch_id = ?", batch);
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(jsonPath("$.inventory.dataState").value("PARTIAL"))
                .andExpect(jsonPath("$.prediction.dataState").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.dataState").value("INSUFFICIENT_DATA"));
    }

    private void expectInventory(String state, int p95) throws Exception {
        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inventory.dataState").value(state))
                .andExpect(jsonPath("$.inventory.p95DelayMinutes").value(p95));
    }

    @Test void aTimestampWithZeroSecondsIsStillRenderedWithItsSecondsField() throws Exception {
        // OffsetDateTime.toString() drops ":00" when the seconds are zero, but the API always writes
        // them, so comparing the two directly failed roughly one run in sixty - whenever the test
        // happened to start on second 00. This pins the API's format on exactly that timestamp, so a
        // return to toString() fails every run instead of hiding until CI is unlucky.
        OffsetDateTime zeroSecond = OffsetDateTime.now().withNano(0).withSecond(0).minusDays(2);
        assertNotEquals(zeroSecond.toString(), apiTimestamp(zeroSecond));

        OffsetDateTime now = OffsetDateTime.now().withNano(0);
        insertStation("A", "1001", true);
        insertInventory("A", now.minusMinutes(1), "NORMAL");
        UUID batch = insertBatch(now.minusMinutes(1), now.minusMinutes(1), now.plusHours(1), "ACTIVE");
        insertPrediction(batch, "A");
        insertProfile("A", zeroSecond);

        mvc.perform(get("/api/v1/admin/ops/data-status").with(allowed()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.latestGeneratedAt").value(apiTimestamp(zeroSecond)));
    }

    /** How the API renders an OffsetDateTime, which always keeps the seconds field. */
    private String apiTimestamp(OffsetDateTime value) {
        return value.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private RequestPostProcessor allowed() { return authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.DATA_STATUS_READ))); }

    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) {
        Users user = users.save(Users.builder().provider("google").providerUserId(UUID.randomUUID().toString()).displayName("ops").role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private void insertStation(String id, String number, boolean active) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, number, id, 37.5, 127.0, active, now, now);
    }

    private void insertInventory(String stationId, OffsetDateTime collectedAt, String status) {
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", stationId, 1, collectedAt, status, OffsetDateTime.now());
    }

    private UUID insertBatch(OffsetDateTime featureAsOf, OffsetDateTime generatedAt, OffsetDateTime expiresAt, String status) {
        return insertBatch(UUID.randomUUID(), featureAsOf, generatedAt, expiresAt, status);
    }

    private UUID insertBatch(UUID id, OffsetDateTime featureAsOf, OffsetDateTime generatedAt, OffsetDateTime expiresAt, String status) {
        jdbc.update("INSERT INTO prediction_batches (batch_id, created_at, expires_at, feature_as_of, generated_at, model_version, publish_status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, generatedAt, expiresAt, featureAsOf, generatedAt, "model", status, generatedAt);
        return id;
    }

    private void insertPrediction(UUID batchId, String stationId) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO station_predictions (batch_id, station_id, prediction_target_at, horizon_minutes, at_least_1_probability, at_least_2_probability, at_least_3_probability, at_least_4_probability, at_least_5_probability, prediction_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batchId, stationId, now.plusHours(1), 60, .9, .8, .7, .6, .5, "NORMAL", now);
    }

    private void insertProfile(String stationId, OffsetDateTime generatedAt) {
        jdbc.update("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (?, ?, ?, ?, ?, ?)", stationId, java.time.LocalDate.of(2026, 8, 1), java.time.LocalDate.of(2026, 8, 28), 1, "{}", generatedAt);
    }
}
