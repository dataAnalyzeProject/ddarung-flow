package com.ddarungflow.modelops;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@Transactional
public class ModelUploadService {

    private final ModelUploadRepository uploadRepository;

    public ModelUploadService(ModelUploadRepository uploadRepository) {
        this.uploadRepository = uploadRepository;
    }

    public ModelUpload createUpload(ModelUpload upload) {
        if (upload == null) {
            throw new IllegalArgumentException("Upload must not be null");
        }
        if (upload.getId() == null) {
            throw new IllegalArgumentException("Upload id must not be null");
        }
        if (upload.getRequestedByUserId() == null) {
            throw new IllegalArgumentException("requestedByUserId must not be null");
        }
        if (upload.getObjectKey() == null || upload.getObjectKey().isBlank()) {
            throw new IllegalArgumentException("objectKey must not be null or blank");
        }
        if (uploadRepository.existsByObjectKey(upload.getObjectKey())) {
            throw new IllegalArgumentException("Duplicate objectKey: " + upload.getObjectKey());
        }
        if (!isValidSha256(upload.getExpectedSha256())) {
            throw new IllegalArgumentException("expectedSha256 must be a 64-character lowercase hexadecimal string");
        }
        if (upload.getMaxBytes() == null || upload.getMaxBytes() <= 0) {
            throw new IllegalArgumentException("maxBytes must be positive");
        }
        if (upload.getStatus() != ModelUploadStatus.CREATED) {
            throw new IllegalArgumentException("Initial upload status must be CREATED");
        }
        if (upload.getCreatedAt() == null || upload.getExpiresAt() == null) {
            throw new IllegalArgumentException("createdAt and expiresAt must not be null");
        }
        if (!upload.getExpiresAt().isAfter(upload.getCreatedAt())) {
            throw new IllegalArgumentException("expiresAt must be strictly after createdAt");
        }

        return uploadRepository.save(upload);
    }

    public ModelUpload complete(UUID uploadId, OffsetDateTime now) {
        if (uploadId == null || now == null) {
            throw new IllegalArgumentException("uploadId and now must not be null");
        }
        ModelUpload upload = uploadRepository.findById(uploadId)
            .orElseThrow(() -> new IllegalArgumentException("ModelUpload not found: " + uploadId));

        if (upload.getStatus() != ModelUploadStatus.CREATED) {
            throw new IllegalStateException("Cannot complete upload session in terminal state: " + upload.getStatus());
        }
        if (now.isAfter(upload.getExpiresAt())) {
            throw new IllegalStateException("Upload session has expired and cannot be completed");
        }

        upload.markCompleted(now);
        return uploadRepository.save(upload);
    }

    public ModelUpload fail(UUID uploadId, OffsetDateTime now) {
        if (uploadId == null) {
            throw new IllegalArgumentException("uploadId must not be null");
        }
        ModelUpload upload = uploadRepository.findById(uploadId)
            .orElseThrow(() -> new IllegalArgumentException("ModelUpload not found: " + uploadId));

        if (upload.getStatus() != ModelUploadStatus.CREATED) {
            throw new IllegalStateException("Cannot fail upload session in terminal state: " + upload.getStatus());
        }

        upload.markFailed();
        return uploadRepository.save(upload);
    }

    public ModelUpload expire(UUID uploadId, OffsetDateTime now) {
        if (uploadId == null) {
            throw new IllegalArgumentException("uploadId must not be null");
        }
        ModelUpload upload = uploadRepository.findById(uploadId)
            .orElseThrow(() -> new IllegalArgumentException("ModelUpload not found: " + uploadId));

        if (upload.getStatus() != ModelUploadStatus.CREATED) {
            throw new IllegalStateException("Cannot expire upload session in terminal state: " + upload.getStatus());
        }

        upload.markExpired();
        return uploadRepository.save(upload);
    }

    private static boolean isValidSha256(String hash) {
        return hash != null && hash.matches("^[0-9a-f]{64}$");
    }
}
