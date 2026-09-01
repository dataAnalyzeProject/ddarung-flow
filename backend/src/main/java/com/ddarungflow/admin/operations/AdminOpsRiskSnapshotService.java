package com.ddarungflow.admin.operations;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class AdminOpsRiskSnapshotService {
    public static final int TTL_MINUTES = 2;
    private static final int EXPIRED_RETENTION_MINUTES = 10;
    private final AdminOpsRiskSnapshotRepository repository;
    public AdminOpsRiskSnapshotService(AdminOpsRiskSnapshotRepository repository) { this.repository = repository; }

    @Transactional
    public void save(AdminOpsRiskSnapshotRepository.Header header, List<AdminOpsRiskSnapshotRepository.Item> items) {
        repository.deleteExpired(header.createdAt().minusMinutes(EXPIRED_RETENTION_MINUTES));
        repository.save(header, items);
    }
    public AdminOpsRiskSnapshotRepository.Header header(UUID snapshotId, OffsetDateTime now) {
        AdminOpsRiskSnapshotRepository.Header header = repository.findHeader(snapshotId);
        if (header == null) throw new UnknownSnapshotException();
        if (!header.expiresAt().isAfter(now)) throw new ExpiredSnapshotException();
        return header;
    }
    public List<AdminOpsRiskSnapshotRepository.Item> page(UUID snapshotId, int afterOrdinal, int limit) { return repository.findPage(snapshotId, afterOrdinal, limit); }
    public AdminOpsRiskSnapshotRepository.Item item(UUID snapshotId, String stationNumber) { return repository.findItem(snapshotId, stationNumber); }
    public static class UnknownSnapshotException extends RuntimeException { }
    public static class ExpiredSnapshotException extends RuntimeException { }
}
