package com.ddarungflow.admin.data;

import com.ddarungflow.admin.operations.AdminOpsDataStatusDtos;
import com.ddarungflow.admin.operations.AdminOpsDataStatusService;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class AdminDataPipelineService {
    private final AdminOpsDataStatusService dataStatusService;

    public AdminDataPipelineService(AdminOpsDataStatusService dataStatusService) {
        this.dataStatusService = dataStatusService;
    }

    public AdminDataPipelineDtos.Response status(OffsetDateTime referenceTime) {
        List<AdminDataPipelineDtos.Stage> stages = new ArrayList<>();
        stages.add(notInstrumented("SOURCE", "서울시·기상 원천", "AIRFLOW_SOURCE_NOT_CONNECTED"));
        stages.add(notInstrumented("RAW", "Raw 저장", "RAW_LEDGER_NOT_CONNECTED"));
        stages.add(notInstrumented("QUALITY", "품질 검사", "QUALITY_LEDGER_NOT_CONNECTED"));
        stages.add(notInstrumented("CURATED", "Curated 저장", "CURATED_LEDGER_NOT_CONNECTED"));
        stages.add(notInstrumented("QUARANTINE", "Quarantine", "QUARANTINE_SOURCE_NOT_CONNECTED"));

        AdminOpsDataStatusDtos.Response sourceStatus = dataStatusService.dataStatus(referenceTime, true);
        var serving = sourceStatus.inventory();
        long servingNonNormalCount = serving.inventoryStatusBreakdown().entrySet().stream()
                .filter(entry -> !"NORMAL".equals(entry.getKey())).mapToLong(java.util.Map.Entry::getValue).sum();
        stages.add(new AdminDataPipelineDtos.Stage("SERVING", "Serving DB", serving.dataState(),
                serving.latestCollectedAt(), serving.latestCollectedAt(), null, serving.latestStationCount(),
                serving.inventoryStatusBreakdown().getOrDefault("NORMAL", 0L), null,
                serving.missingStationCount() + servingNonNormalCount, "station_inventory_current",
                serving.latestCollectedAt() == null ? "SERVING_SOURCE_EMPTY" : null));

        var profile = sourceStatus.profile();
        long missingProfileCount = Math.max(0,
                profile.activePublicStationCount() - profile.profileAvailableStationCount());
        String profileState = "NORMAL".equals(profile.dataState()) ? "PARTIAL" : profile.dataState();
        String profileReason = profile.latestGeneratedAt() == null ? "PROFILE_SOURCE_EMPTY"
                : "PROFILE_FRESHNESS_BOUNDARY_NOT_DEFINED";
        stages.add(new AdminDataPipelineDtos.Stage("PROFILE", "Profile 생성", profileState,
                profile.latestGeneratedAt(), profile.latestGeneratedAt(), null,
                profile.profileAvailableStationCount(), profile.profileAvailableStationCount(), null,
                missingProfileCount, "station_rhythm_profiles", profileReason));

        var global = sourceStatus.globalRisk();
        Long globalFailedCount = global.activePublicStationCount() == null ? null
                : (long) global.activePublicStationCount() - global.normalInferenceCount();
        stages.add(new AdminDataPipelineDtos.Stage("GLOBAL", "Global 운영 분석", global.dataState(),
                global.publishedAt(), global.publishedAt(), global.generationDurationMs(),
                global.evaluatedStationCount() == null ? null : global.evaluatedStationCount().longValue(),
                global.normalInferenceCount() == null ? null : global.normalInferenceCount().longValue(), null,
                globalFailedCount, "admin_ops_global_risk_results",
                global.resultId() == null ? "GLOBAL_RESULT_NOT_PUBLISHED" : null));

        String dataState = stages.stream().allMatch(stage -> "NOT_INSTRUMENTED".equals(stage.dataState()))
                ? "NOT_INSTRUMENTED" : stages.stream().allMatch(stage -> "NORMAL".equals(stage.dataState()))
                ? "NORMAL" : "PARTIAL";
        return new AdminDataPipelineDtos.Response(referenceTime, OffsetDateTime.now(), dataState, stages);
    }

    private AdminDataPipelineDtos.Stage notInstrumented(String id, String label, String reason) {
        return new AdminDataPipelineDtos.Stage(id, label, "NOT_INSTRUMENTED", null, null,
                null, null, null, null, null, null, reason);
    }
}
