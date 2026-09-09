package com.ddarungflow.admin.data;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class AdminDataPipelineService {
    private static final Duration REFRESH_FRESHNESS = Duration.ofMinutes(10);
    private final AdminDataPipelineRepository repository;

    public AdminDataPipelineService(AdminDataPipelineRepository repository) {
        this.repository = repository;
    }

    public AdminDataPipelineDtos.Response status(OffsetDateTime referenceTime) {
        var run = repository.latestRun();
        List<AdminDataPipelineDtos.Stage> stages = run == null
                ? List.of(noEvidence("SOURCE", "서울시 재고 수집"),
                        noEvidence("QUALITY", "완전성·값 검증"),
                        noEvidence("SERVING", "현재 재고 게시"))
                : stages(run, referenceTime);
        String dataState = rootState(stages);
        return new AdminDataPipelineDtos.Response(referenceTime, OffsetDateTime.now(), dataState, stages);
    }

    private List<AdminDataPipelineDtos.Stage> stages(AdminDataPipelineRepository.PipelineRun run,
                                                      OffsetDateTime referenceTime) {
        if ("FAILURE".equals(run.status())) return failedStages(run);
        boolean delayed = Duration.between(run.completedAt(), referenceTime).compareTo(REFRESH_FRESHNESS) > 0;
        String healthyState = delayed ? "DELAYED" : "NORMAL";
        Long qualityFailed = difference(run.sourceCount(), run.validatedCount());
        String qualityState = positive(qualityFailed) ? "PARTIAL" : healthyState;
        String servingState = positive(run.missingCount()) ? "PARTIAL" : healthyState;
        return List.of(
                stage("SOURCE", "서울시 재고 수집", healthyState, run, run.sourceCount(),
                        run.sourceCount(), 0L, "SeoulBikeApiClient", delayed ? "PIPELINE_RUN_DELAYED" : null),
                stage("QUALITY", "완전성·값 검증", qualityState, run, run.sourceCount(),
                        run.validatedCount(), qualityFailed, "inventory_current_refresher", positive(qualityFailed)
                                ? "QUALITY_ROWS_SKIPPED" : delayed ? "PIPELINE_RUN_DELAYED" : null),
                stage("SERVING", "현재 재고 게시", servingState, run, run.publishedCount(),
                        run.normalCount(), run.missingCount(), "station_inventory_current", positive(run.missingCount())
                                ? "SOURCE_STATIONS_MISSING" : delayed ? "PIPELINE_RUN_DELAYED" : null));
    }

    private List<AdminDataPipelineDtos.Stage> failedStages(AdminDataPipelineRepository.PipelineRun run) {
        String failureStage = run.failureStage() == null ? "SOURCE" : run.failureStage();
        boolean sourceSucceeded = !"SOURCE".equals(failureStage) && run.sourceCount() != null;
        boolean qualitySucceeded = "SERVING".equals(failureStage) && run.validatedCount() != null;
        return List.of(
                failedStage("SOURCE", "서울시 재고 수집", run, sourceSucceeded, run.sourceCount(),
                        run.sourceCount(), "SeoulBikeApiClient", failureStage),
                failedStage("QUALITY", "완전성·값 검증", run, qualitySucceeded, run.sourceCount(),
                        run.validatedCount(), "inventory_current_refresher", failureStage),
                failedStage("SERVING", "현재 재고 게시", run, false, run.publishedCount(),
                        run.normalCount(), "station_inventory_current", failureStage));
    }

    private AdminDataPipelineDtos.Stage failedStage(String id, String label,
            AdminDataPipelineRepository.PipelineRun run, boolean succeeded, Long processed, Long passed,
            String source, String failureStage) {
        String state = id.equals(failureStage) ? "UNAVAILABLE" : succeeded ? "NORMAL" : "INSUFFICIENT_DATA";
        String reason = id.equals(failureStage) ? run.reasonCode() : succeeded ? null : "UPSTREAM_STAGE_FAILED";
        return new AdminDataPipelineDtos.Stage(id, label, state,
                succeeded ? run.completedAt() : null, run.completedAt(), duration(run), processed, passed,
                null, difference(processed, passed), source, reason);
    }

    private AdminDataPipelineDtos.Stage stage(String id, String label, String state,
            AdminDataPipelineRepository.PipelineRun run, Long processed, Long passed, Long failed,
            String source, String reason) {
        return new AdminDataPipelineDtos.Stage(id, label, state, run.completedAt(), run.completedAt(),
                duration(run), processed, passed, null, failed, source, reason);
    }

    private AdminDataPipelineDtos.Stage noEvidence(String id, String label) {
        return new AdminDataPipelineDtos.Stage(id, label, "INSUFFICIENT_DATA", null, null,
                null, null, null, null, null, null, "PIPELINE_RUN_NOT_RECORDED");
    }

    private Long duration(AdminDataPipelineRepository.PipelineRun run) {
        return Math.max(0, Duration.between(run.startedAt(), run.completedAt()).toMillis());
    }

    private Long difference(Long total, Long passed) {
        return total == null || passed == null ? null : Math.max(0, total - passed);
    }

    private boolean positive(Long value) {
        return value != null && value > 0;
    }

    private String rootState(List<AdminDataPipelineDtos.Stage> stages) {
        for (String candidate : List.of("UNAVAILABLE", "DELAYED", "INSUFFICIENT_DATA", "PARTIAL")) {
            if (stages.stream().anyMatch(stage -> candidate.equals(stage.dataState()))) return candidate;
        }
        return "NORMAL";
    }
}
