package com.ddarungflow.admin;
import com.ddarungflow.dto.AdminModelPerformanceDtos;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import org.springframework.stereotype.Service;
@Service public class ModelPerformanceService {
 private final ModelPerformanceRunRepository runs; public ModelPerformanceService(ModelPerformanceRunRepository runs) { this.runs=runs; }
 public AdminModelPerformanceDtos.Response find(String artifactSha256) { ModelPerformanceRun run = selectRun(artifactSha256); var p=run.getPayload(); return new AdminModelPerformanceDtos.Response(run.getArtifactSha256(),run.getModelVersion(),run.getGeneratedAt(),p.get("evaluation"),p.get("combinations"),p.get("calibrationBins")); }
 public AdminModelPerformanceDtos.DiagnosticsResponse findDiagnostics(String artifactSha256) { ModelPerformanceRun run = selectRun(artifactSha256); return new AdminModelPerformanceDtos.DiagnosticsResponse(run.getArtifactSha256(),run.getModelVersion(),run.getGeneratedAt(),run.getPayload().get("segments")); }
 private ModelPerformanceRun selectRun(String artifactSha256) { return (artifactSha256 == null || artifactSha256.isBlank() ? runs.findFirstByOrderByGeneratedAtDesc() : runs.findFirstByArtifactSha256OrderByGeneratedAtDesc(artifactSha256)).orElseThrow(ModelPerformanceNotFoundException::new); }
 public static class ModelPerformanceNotFoundException extends RuntimeException { }
}
