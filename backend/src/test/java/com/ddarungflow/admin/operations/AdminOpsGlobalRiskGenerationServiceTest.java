package com.ddarungflow.admin.operations;

import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
class AdminOpsGlobalRiskGenerationServiceTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired AdminOpsReadRepository readRepository;
    @Autowired AdminOpsGlobalRiskRepository globalRepository;
    @Autowired AdminOpsGlobalRiskReadService globalReadService;
    @MockBean InferenceClient inferenceClient;
    private AdminOpsGlobalRiskGenerationService service;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM admin_ops_global_risk_control");
        jdbc.update("DELETE FROM admin_ops_global_risk_items");
        jdbc.update("DELETE FROM admin_ops_global_risk_results");
        jdbc.update("DELETE FROM station_inventory_current");
        jdbc.update("DELETE FROM stations");
        service = new AdminOpsGlobalRiskGenerationService(readRepository, globalRepository, inferenceClient,
                0, 900_000, 1_200_000, millis -> { }, System::nanoTime);
    }

    @Test
    void evaluatesEachStationOnceInSequentialChunksAndStoresAllConditions() {
        for (int index = 0; index < 21; index++) insert("ST-" + index, String.format("%04d", index + 1), 2, "NORMAL", OffsetDateTime.now());
        List<InferenceDtos.CandidateRequest> capturedRequests = new ArrayList<>();
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> {
            List<InferenceDtos.CandidateRequest> requests = invocation.getArgument(0);
            capturedRequests.addAll(requests);
            return response(requests, "model-v1");
        });

        var outcome = service.generate();

        assertEquals("SUCCESS", outcome.state());
        assertEquals(2, outcome.inferenceCallCount());
        verify(inferenceClient, times(2)).predictAdminChunk(anyList());
        assertEquals(84, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_items", Integer.class));
        var current = globalRepository.current();
        assertEquals(21, current.result().evaluatedCount());
        capturedRequests.forEach(request -> assertEquals(current.result().referenceTime(), request.featureAsOf()));
        OffsetDateTime firstTarget = jdbc.queryForObject(
                "SELECT prediction_target_at FROM admin_ops_global_risk_items WHERE result_id = ? AND horizon_minutes = 60 FETCH FIRST ROW ONLY",
                OffsetDateTime.class, current.result().resultId());
        assertEquals(current.result().referenceTime().plusMinutes(60), firstTarget);
    }

    @Test
    void retriesOneTransportFailureThenPublishes() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenThrow(new IllegalStateException("timeout"))
                .thenAnswer(invocation -> response(invocation.getArgument(0), "model-v1"));
        var outcome = service.generate();
        assertEquals("SUCCESS", outcome.state());
        assertEquals(2, outcome.inferenceCallCount());
        assertNotNull(globalRepository.current().result());
    }

    @Test
    void schemaOrRequestContractFailureIsNotRetried() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenThrow(new IllegalArgumentException("schema mismatch"));
        var outcome = service.generate();
        assertEquals("FAILED", outcome.state());
        assertEquals("INFERENCE_RESPONSE_SCHEMA_MISMATCH", outcome.reason());
        assertEquals(1, outcome.inferenceCallCount());
        verify(inferenceClient, times(1)).predictAdminChunk(anyList());
    }

    @Test
    void modelVersionMismatchAbortsWithoutPublishingPartialRows() {
        for (int index = 0; index < 21; index++) insert("ST-" + index, String.format("%04d", index + 1), 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList()))
                .thenAnswer(invocation -> response(invocation.getArgument(0), "model-v1"))
                .thenAnswer(invocation -> response(invocation.getArgument(0), "model-v2"));
        var outcome = service.generate();
        assertEquals("FAILED", outcome.state());
        assertEquals("MODEL_VERSION_MISMATCH", outcome.reason());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_items", Integer.class));
    }

    @Test
    void outOfRangeOrNonMonotonicProbabilityMatrixCannotPublish() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        List<InferenceDtos.ProbabilityRow> invalid = rows();
        invalid.set(0, new InferenceDtos.ProbabilityRow(60, 1, new BigDecimal("0.40")));
        invalid.set(1, new InferenceDtos.ProbabilityRow(60, 2, new BigDecimal("0.60")));
        when(inferenceClient.predictAdminChunk(anyList())).thenReturn(new InferenceDtos.PredictResponse("NORMAL", null, "model-v1",
                OffsetDateTime.now(), List.of(new InferenceDtos.CandidatePrediction("ST-1", "NORMAL", invalid))));
        var outcome = service.generate();
        assertEquals("FAILED", outcome.state());
        assertEquals("PROBABILITY_MATRIX_MISMATCH", outcome.reason());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
        verify(inferenceClient, times(1)).predictAdminChunk(anyList());
    }

    @Test
    void mapActivityAndLiveLeaseSkipWithoutInference() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        service.mapStarted();
        try { assertEquals("MAP_ACTIVE", service.generate().reason()); }
        finally { service.mapFinished(); }
        globalRepository.acquireLease(UUID.randomUUID(), 1_200_000);
        assertEquals("LEASE_HELD", service.generate().reason());
        verify(inferenceClient, never()).predictAdminChunk(anyList());
    }

    @Test
    void sourceBackedInventoryGapsPublishAsCoverageWithoutFabricatedInference() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        insert("ST-2", "1002", null, "MISSING", OffsetDateTime.now());
        insert("ST-3", "1003", 1, "DELAYED", OffsetDateTime.now().minusHours(2));
        insert("ST-4", "1004", 1, "UNAVAILABLE", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> response(invocation.getArgument(0), "model-v1"));

        assertEquals("SUCCESS", service.generate().state());
        var result = globalRepository.current().result();
        assertEquals(4, result.activePublicStationCount());
        assertEquals(1, result.inventoryEligibleCount());
        assertEquals(1, result.normalInferenceCount());
        assertEquals(1, result.inventoryMissingCount());
        assertEquals(1, result.inventoryDelayedCount());
        assertEquals(1, result.inventoryUnavailableCount());
        assertEquals(16, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_items", Integer.class));
        verify(inferenceClient, times(1)).predictAdminChunk(anyList());
    }

    @Test
    void failureKeepsLastGoodAndRetentionKeepsOnlyCurrentAndPrevious() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> response(invocation.getArgument(0), "model-v1"));
        assertEquals("SUCCESS", service.generate().state());
        UUID first = globalRepository.current().result().resultId();

        when(inferenceClient.predictAdminChunk(anyList())).thenThrow(new IllegalStateException("timeout"));
        assertEquals("FAILED", service.generate().state());
        assertEquals(first, globalRepository.current().result().resultId());

        doAnswer(invocation -> response(invocation.getArgument(0), "model-v1")).when(inferenceClient).predictAdminChunk(anyList());
        assertEquals("SUCCESS", service.generate().state());
        assertEquals("SUCCESS", service.generate().state());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
        assertEquals(8, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_items i JOIN admin_ops_global_risk_results r ON r.result_id = i.result_id", Integer.class));
    }

    @Test
    void freshStaleAndExpiredBoundariesDoNotServeExpiredItems() {
        insert("ST-1", "1001", 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> response(invocation.getArgument(0), "model-v1"));
        assertEquals("SUCCESS", service.generate().state());
        var result = globalRepository.current().result();

        assertEquals("FRESH", globalReadService.view(result.freshUntil(), 60).freshnessState());
        assertEquals("STALE", globalReadService.view(result.freshUntil().plusNanos(1), 60).freshnessState());
        assertEquals("STALE", globalReadService.view(result.expiresAt(), 60).freshnessState());
        var expired = globalReadService.view(result.expiresAt().plusNanos(1), 60);
        assertEquals("EXPIRED", expired.freshnessState());
        assertEquals(false, expired.servable());
        assertEquals(0, expired.items().size());
    }

    @Test
    void mapStartingDuringAChunkAbortsBeforePublishAndKeepsLastGood() {
        for (int index = 0; index < 21; index++) insert("ST-" + index, String.format("%04d", index + 1), 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> {
            service.mapStarted();
            return response(invocation.getArgument(0), "model-v1");
        });
        try {
            var outcome = service.generate();
            assertEquals("SKIPPED", outcome.state());
            assertEquals("MAP_PRIORITY", outcome.reason());
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
        } finally {
            service.mapFinished();
        }
    }

    @Test
    void crossInstanceDatabaseMapMarkerAbortsBeforeTheNextChunk() {
        for (int index = 0; index < 21; index++) insert("ST-" + index, String.format("%04d", index + 1), 2, "NORMAL", OffsetDateTime.now());
        when(inferenceClient.predictAdminChunk(anyList())).thenAnswer(invocation -> {
            globalRepository.signalMapPriority();
            return response(invocation.getArgument(0), "model-v1");
        });
        var outcome = service.generate();
        assertEquals("SKIPPED", outcome.state());
        assertEquals("MAP_PRIORITY", outcome.reason());
        assertEquals(1, outcome.inferenceCallCount());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
    }

    @Test
    void rejectsScopeBeyondTheTwoHundredFiftyCallCapacityWithoutTruncating() {
        AdminOpsReadRepository reads = mock(AdminOpsReadRepository.class);
        AdminOpsGlobalRiskRepository globals = mock(AdminOpsGlobalRiskRepository.class);
        OffsetDateTime reference = OffsetDateTime.now();
        when(globals.acquireLease(org.mockito.ArgumentMatchers.any(UUID.class), org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(new AdminOpsGlobalRiskRepository.LeaseAcquisition(true, reference, reference.plusMinutes(20)));
        when(globals.leaseOwned(org.mockito.ArgumentMatchers.any(UUID.class))).thenReturn(true);
        List<AdminOpsReadRepository.Row> rows = new ArrayList<>();
        for (int index = 0; index <= AdminOpsGlobalRiskGenerationService.MAX_STATIONS; index++) {
            rows.add(new AdminOpsReadRepository.Row("ST-" + index, String.valueOf(index), "station", BigDecimal.ONE, BigDecimal.ONE,
                    1, reference, "NORMAL", null, null, null, null, null, null, null, null));
        }
        when(reads.findRows(null, null, null, null)).thenReturn(rows);
        var bounded = new AdminOpsGlobalRiskGenerationService(reads, globals, inferenceClient,
                0, 900_000, 1_200_000, millis -> { }, System::nanoTime);
        var outcome = bounded.generate();
        assertEquals("FAILED", outcome.state());
        assertEquals("SCOPE_EXCEEDS_CALL_CAP", outcome.reason());
        verify(inferenceClient, never()).predictAdminChunk(anyList());
    }

    @Test
    void wallClockLimitStopsBeforeInferenceAndRecordsFailure() {
        AdminOpsReadRepository reads = mock(AdminOpsReadRepository.class);
        AdminOpsGlobalRiskRepository globals = mock(AdminOpsGlobalRiskRepository.class);
        OffsetDateTime reference = OffsetDateTime.now();
        when(globals.acquireLease(org.mockito.ArgumentMatchers.any(UUID.class), org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(new AdminOpsGlobalRiskRepository.LeaseAcquisition(true, reference, reference.plusMinutes(20)));
        AtomicLong nanos = new AtomicLong();
        var bounded = new AdminOpsGlobalRiskGenerationService(reads, globals, inferenceClient,
                0, 1, 1_200_000, millis -> { }, () -> nanos.getAndAdd(2_000_000));
        var outcome = bounded.generate();
        assertEquals("FAILED", outcome.state());
        assertEquals("WALL_CLOCK_LIMIT", outcome.reason());
        verify(inferenceClient, never()).predictAdminChunk(anyList());
    }

    private InferenceDtos.PredictResponse response(List<InferenceDtos.CandidateRequest> candidates, String version) {
        return new InferenceDtos.PredictResponse("NORMAL", null, version, OffsetDateTime.now(), candidates.stream()
                .map(candidate -> new InferenceDtos.CandidatePrediction(candidate.stationId(), "NORMAL", rows())).toList());
    }
    private List<InferenceDtos.ProbabilityRow> rows() {
        List<InferenceDtos.ProbabilityRow> rows = new ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) for (int quantity = 1; quantity <= 5; quantity++)
            rows.add(new InferenceDtos.ProbabilityRow(horizon, quantity, new BigDecimal("0.75")));
        return rows;
    }
    private void insert(String id, String number, Integer bikes, String status, OffsetDateTime collectedAt) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO stations (station_id, station_number, name, latitude, longitude, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)", id, number, number, 37.5, 127.0, now, now);
        jdbc.update("INSERT INTO station_inventory_current (station_id, available_bike_count, collected_at, inventory_status, updated_at) VALUES (?, ?, ?, ?, ?)", id, bikes, collectedAt, status, now);
    }
}
