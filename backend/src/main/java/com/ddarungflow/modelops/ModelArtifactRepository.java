package com.ddarungflow.modelops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ModelArtifactRepository extends JpaRepository<ModelArtifact, Long> {
    boolean existsByVersion(String version);

    boolean existsBySha256(String sha256);

    Optional<ModelArtifact> findFirstByState(ModelArtifactState state);

    Optional<ModelArtifact> findFirstByStateOrderByIdDesc(ModelArtifactState state);
}
