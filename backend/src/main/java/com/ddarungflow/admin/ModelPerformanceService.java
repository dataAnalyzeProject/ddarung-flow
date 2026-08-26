package com.ddarungflow.admin;
import com.ddarungflow.dto.AdminModelPerformanceDtos;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import org.springframework.stereotype.Service;
@Service public class ModelPerformanceService {
 private final ModelPerformanceRunRepository runs; public ModelPerformanceService(ModelPerformanceRunRepository runs) { this.runs=runs; }
 public AdminModelPerformanceDtos.Response find(String sha) { ModelPerformanceRun run = (sha == null || sha.isBlank() ? runs.findFirstByOrderByGeneratedAtDesc() : runs.findFirstByArtifactSha256OrderByGeneratedAtDesc(sha)).orElseThrow(ModelPerformanceNotFoundException::new); var p=run.getPayload(); return new AdminModelPerformanceDtos.Response(run.getArtifactSha256(),run.getModelVersion(),run.getGeneratedAt(),p.get("evaluation"),p.get("combinations"),p.get("segments"),p.get("calibrationBins")); }
 public static class ModelPerformanceNotFoundException extends RuntimeException { }
}
