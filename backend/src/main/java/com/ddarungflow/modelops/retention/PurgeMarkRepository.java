package com.ddarungflow.modelops.retention;

import com.ddarungflow.modelops.ModelArtifactState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PurgeMarkRepository extends JpaRepository<PurgeMark, Long> {

    Optional<PurgeMark> findByArtifactId(Long artifactId);

    boolean existsByArtifactId(Long artifactId);

    List<PurgeMark> findByState(ModelArtifactState state);
}
