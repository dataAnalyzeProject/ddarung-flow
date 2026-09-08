package com.ddarungflow.admin.operations;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
class AdminOpsGlobalRiskRepositoryTest {
    @Autowired AdminOpsGlobalRiskRepository repository;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clear() {
        jdbc.update("DELETE FROM admin_ops_global_risk_control");
        jdbc.update("DELETE FROM admin_ops_global_risk_items");
        jdbc.update("DELETE FROM admin_ops_global_risk_results");
    }

    @Test
    void leaseHasOneOwnerAndCanBeRecoveredAfterExpiry() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        assertTrue(repository.acquireLease(first, 1_200_000).acquired());
        assertFalse(repository.acquireLease(second, 1_200_000).acquired());
        jdbc.update("UPDATE admin_ops_global_risk_control SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1' SECOND WHERE control_key = 'GLOBAL'");
        assertTrue(repository.acquireLease(second, 1_200_000).acquired());
        assertTrue(repository.leaseOwned(second));
    }

    @Test
    void expiredOwnerCannotPublish() {
        OffsetDateTime now = OffsetDateTime.now();
        UUID owner = UUID.randomUUID();
        assertTrue(repository.acquireLease(owner, 1_200_000).acquired());
        jdbc.update("UPDATE admin_ops_global_risk_control SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1' SECOND WHERE control_key = 'GLOBAL'");
        var result = new AdminOpsGlobalRiskRepository.Result(UUID.randomUUID(), now, now.plusMinutes(21), now.plusMinutes(21),
                now.plusMinutes(41), now.plusMinutes(51), "model-v1", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
        assertThrows(AdminOpsGlobalRiskRepository.LeaseLostException.class,
                () -> repository.publish(owner, now, result, List.of()));
    }

    @Test
    void failedItemBatchRollsBackHeaderAndKeepsCurrentPointer() {
        OffsetDateTime now = repository.databaseNow();
        UUID firstOwner = UUID.randomUUID();
        assertTrue(repository.acquireLease(firstOwner, 1_200_000).acquired());
        var first = result(now);
        repository.publish(firstOwner, now, first, List.of(item("1001")));

        UUID secondOwner = UUID.randomUUID();
        OffsetDateTime secondStart = repository.acquireLease(secondOwner, 1_200_000).startedAt();
        var second = result(secondStart);
        assertThrows(RuntimeException.class,
                () -> repository.publish(secondOwner, secondStart, second, List.of(item("1002"), item("1002"))));
        org.junit.jupiter.api.Assertions.assertEquals(first.resultId(), repository.current().result().resultId());
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM admin_ops_global_risk_results", Integer.class));
    }

    private AdminOpsGlobalRiskRepository.Result result(OffsetDateTime now) {
        return new AdminOpsGlobalRiskRepository.Result(UUID.randomUUID(), now, now, now, now.plusMinutes(20), now.plusMinutes(30),
                "model-v1", 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1);
    }

    private AdminOpsGlobalRiskRepository.Item item(String stationNumber) {
        return new AdminOpsGlobalRiskRepository.Item(stationNumber, 60, "station", BigDecimal.ONE, BigDecimal.ONE, 1,
                OffsetDateTime.now(), "NORMAL", BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE,
                OffsetDateTime.now().plusMinutes(60));
    }
}
