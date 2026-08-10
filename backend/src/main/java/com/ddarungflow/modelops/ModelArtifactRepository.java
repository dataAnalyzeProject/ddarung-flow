package com.ddarungflow.modelops;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ModelArtifactRepository extends JpaRepository<ModelArtifact, Long> {
    boolean existsByVersion(String version);

    boolean existsBySha256(String sha256);
}
