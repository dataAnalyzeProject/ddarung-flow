package com.ddarungflow.modelops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ModelUploadRepository extends JpaRepository<ModelUpload, UUID> {
    boolean existsByObjectKey(String objectKey);
}
