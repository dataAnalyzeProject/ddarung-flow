package com.ddarungflow.admin.data;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminDataPipelineDtos {
    private AdminDataPipelineDtos() { }

    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt,
                           String dataState, List<Stage> stages) { }

    public record Stage(String stageId, String label, String dataState,
                        OffsetDateTime lastSuccessAt, OffsetDateTime lastAttemptAt,
                        Long durationMs, Long processedCount, Long passedCount,
                        Long quarantinedCount, Long failedCount,
                        String sourceReference, String reasonCode) { }
}
