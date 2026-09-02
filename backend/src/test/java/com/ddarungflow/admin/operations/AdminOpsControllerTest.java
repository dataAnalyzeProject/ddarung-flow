package com.ddarungflow.admin.operations;

import com.ddarungflow.admin.access.AdminPermission;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.repository.UsersRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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
    @Autowired private AdminOpsReadService service;
    @MockBean private InferenceClient inferenceClient;

    @BeforeEach
    void clearAndStubRuntime() {
        jdbc.update("DELETE FROM admin_ops_runtime_risk_snapshot_items");
        jdbc.update("DELETE FROM admin_ops_runtime_risk_snapshots");
        jdbc.update("DELETE FROM station_inventory_current");
        jdbc.update("DELETE FROM stations");
        users.deleteAll();
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> {
            List<InferenceDtos.CandidateRequest> candidates = invocation.getArgument(0);
            return new InferenceDtos.PredictResponse("NORMAL", null, "runtime-test-v1", OffsetDateTime.now(), candidates.stream()
                    .map(candidate -> new InferenceDtos.CandidatePrediction(candidate.stationId(), "NORMAL", rows())).toList());
        });
    }

    @Test
    void requiresBboxAfterExistingPermissionGate() throws Exception {
        mvc.perform(get("/api/v1/admin/ops/risk-stations")) .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/ops/risk-stations").with(authentication(auth(UserRole.ADMIN, Set.of())))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/ops/risk-stations").with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createsAStableRuntimeSnapshotForZeroBikeStation() throws Exception {
        insert("ST-1", "1001", 0);
        insert("ST-2", "1002", 4);
        MvcResult first = mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38&limit=1")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.snapshotId").isNotEmpty())
                .andExpect(jsonPath("$.items[0].station.currentBikes").value(0)).andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor");
        String snapshotId = JsonPath.read(first.getResponse().getContentAsString(), "$.snapshotId");
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38&limit=1&cursor=" + cursor + "&snapshotId=" + snapshotId)
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.snapshotId").value(snapshotId)).andExpect(jsonPath("$.items[0].station.stationNumber").value("1002"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations/1001?horizonMinutes=60&requiredBikeCount=1&snapshotId=" + snapshotId)
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.station.station.currentBikes").value(0));
    }

    @Test
    void rejectsScopeLargerThanOneHundredWithoutPartialRanking() throws Exception {
        for (int index = 0; index < 101; index++) insert("ST-" + index, String.format("%04d", index + 1), 1);
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RISK_SCOPE_TOO_LARGE"));
        verify(inferenceClient, never()).predictAdminChunk(anyList());
    }

    @Test
    void rejectsAnOverCapScopeBeforeCheckingTheInferenceGuard() throws Exception {
        for (int index = 0; index < 101; index++) insert("ST-" + index, String.format("%04d", index + 1), 1);
        java.lang.reflect.Field guard = AdminOpsReadService.class.getDeclaredField("evaluating");
        guard.setAccessible(true);
        AtomicBoolean evaluating = (AtomicBoolean) guard.get(service);
        evaluating.set(true);
        try {
            mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                            .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RISK_SCOPE_TOO_LARGE"));
            verify(inferenceClient, never()).predictAdminChunk(anyList());
        } finally {
            evaluating.set(false);
        }
    }

    @Test
    void doesNotFallbackWhenRuntimeIsUnavailable() throws Exception {
        insert("ST-1", "1001", 1);
        when(inferenceClient.predictAdminChunk(anyList())).thenThrow(new IllegalStateException("timeout"));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("OPS_RISK_INFERENCE_UNAVAILABLE"));
    }

    @Test
    void rejectsMalformedChunkResponseBeforeCreatingASnapshot() throws Exception {
        insert("ST-1", "1001", 1);
        when(inferenceClient.predictAdminChunk(anyList())).thenReturn(new InferenceDtos.PredictResponse("NORMAL", null, "runtime-test-v1", OffsetDateTime.now(), List.of()));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("OPS_RISK_INFERENCE_UNAVAILABLE"));
        org.junit.jupiter.api.Assertions.assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_runtime_risk_snapshots", Integer.class));
    }

    @Test
    void sortsBySelectedShortageProbabilityDescendingAndChunksTwentySequentially() throws Exception {
        for (int index = 0; index < 21; index++) insert("ST-" + index, String.format("%04d", index + 1), 1);
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> {
            List<InferenceDtos.CandidateRequest> candidates = invocation.getArgument(0);
            return new InferenceDtos.PredictResponse("NORMAL", null, "runtime-test-v1", OffsetDateTime.now(), candidates.stream().map(candidate -> {
                BigDecimal atLeast = "0002".equals(candidate.stationNumber()) ? new BigDecimal("0.20") : new BigDecimal("0.90");
                return new InferenceDtos.CandidatePrediction(candidate.stationId(), "NORMAL", rows(atLeast));
            }).toList());
        });
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].station.stationNumber").value("0002"));
        verify(inferenceClient, times(2)).predictAdminChunk(anyList());
    }

    @Test
    void returnsExpiredForAnExpiredKnownSnapshot() throws Exception {
        insert("ST-1", "1001", 1);
        MvcResult created = mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andReturn();
        String snapshotId = JsonPath.read(created.getResponse().getContentAsString(), "$.snapshotId");
        jdbc.update("UPDATE admin_ops_runtime_risk_snapshots SET expires_at = ? WHERE snapshot_id = ?", OffsetDateTime.now().minusSeconds(1), UUID.fromString(snapshotId));
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38&snapshotId=" + snapshotId)
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RISK_SNAPSHOT_EXPIRED"));
    }

    @Test
    void rejectsSnapshotWhenTheSuppliedScopeDoesNotMatch() throws Exception {
        insert("ST-1", "1001", 1);
        MvcResult created = mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,37,128,38")
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isOk()).andReturn();
        String snapshotId = JsonPath.read(created.getResponse().getContentAsString(), "$.snapshotId");
        mvc.perform(get("/api/v1/admin/ops/risk-stations?bbox=126,36,128,38&snapshotId=" + snapshotId)
                        .with(authentication(auth(UserRole.ADMIN, Set.of(AdminPermission.OPS_RISK_MAP_READ)))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RISK_SNAPSHOT_INVALID"));
    }

    private List<InferenceDtos.ProbabilityRow> rows() {
        return rows(new BigDecimal("0.80"));
    }
    private List<InferenceDtos.ProbabilityRow> rows(BigDecimal first) {
        List<InferenceDtos.ProbabilityRow> values = new ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) for (int quantity = 1; quantity <= 5; quantity++) values.add(new InferenceDtos.ProbabilityRow(horizon, quantity, first.subtract(new BigDecimal("0.05").multiply(BigDecimal.valueOf(quantity - 1)))));
        return values;
    }
    private void insert(String id, String number, int bikes) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, number, number, 37.5, 127.0, true, now, now);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, 'NORMAL', ?)", id, bikes, now, now);
    }
    private UsernamePasswordAuthenticationToken auth(UserRole role, Set<AdminPermission> permissions) {
        Users user = users.save(Users.builder().provider("google").providerUserId("ops-" + UUID.randomUUID()).displayName("ops").role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user, Set.of(), permissions);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
