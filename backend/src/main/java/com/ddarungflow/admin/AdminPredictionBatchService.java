package com.ddarungflow.admin;

import com.ddarungflow.dto.AdminPredictionBatchDtos;
import com.ddarungflow.repository.PredictionBatchRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Service
public class AdminPredictionBatchService {
    private final PredictionBatchRepository batches;

    public AdminPredictionBatchService(PredictionBatchRepository batches) { this.batches = batches; }

    public AdminPredictionBatchDtos.Response predictionBatches(OffsetDateTime now) {
        long expectedStationCount = batches.expectedStationCount();
        List<AdminPredictionBatchDtos.Batch> items = batches.findRecentBatchAggregates().stream()
                .map(batch -> toDto(batch, expectedStationCount, now)).toList();
        AdminPredictionBatchDtos.Batch latest = items.isEmpty() ? null : items.getFirst();
        return new AdminPredictionBatchDtos.Response(
                new AdminPredictionBatchDtos.Summary(
                        batches.totalBatchCount(),
                        batches.activeBatchCount(),
                        latest == null ? null : latest.featureAsOf(),
                        latest == null ? null : latest.publishLagSeconds(),
                        expectedStationCount
                ),
                items,
                now
        );
    }

    private AdminPredictionBatchDtos.Batch toDto(PredictionBatchRepository.BatchAggregate batch, long expectedStationCount, OffsetDateTime now) {
        Long lag = batch.publishedAt() == null ? null : Math.max(0, Duration.between(batch.generatedAt(), batch.publishedAt()).getSeconds());
        Double coverage = expectedStationCount == 0 ? null : (double) batch.stationCount() / expectedStationCount;
        return new AdminPredictionBatchDtos.Batch(
                batch.batchId(), batch.modelVersion(), batch.publishStatus(), batch.featureAsOf(), batch.generatedAt(),
                batch.publishedAt(), batch.expiresAt(), lag, batch.stationCount(), batch.rowCount(), coverage,
                Map.of("60", batch.horizon60(), "120", batch.horizon120(), "180", batch.horizon180(), "240", batch.horizon240()),
                !batch.expiresAt().isAfter(now)
        );
    }
}
