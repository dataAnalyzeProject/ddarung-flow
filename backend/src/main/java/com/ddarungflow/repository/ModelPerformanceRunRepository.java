package com.ddarungflow.repository;
import com.ddarungflow.entity.ModelPerformanceRun;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface ModelPerformanceRunRepository extends JpaRepository<ModelPerformanceRun, Long> {
    Optional<ModelPerformanceRun> findFirstByOrderByGeneratedAtDesc();
    Optional<ModelPerformanceRun> findFirstByArtifactSha256OrderByGeneratedAtDesc(String artifactSha256);
}
