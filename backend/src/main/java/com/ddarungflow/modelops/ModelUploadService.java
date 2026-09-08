package com.ddarungflow.modelops;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
@Transactional
public class ModelUploadService {
    static final long SERVER_MAX_UPLOAD_BYTES = 512L * 1024 * 1024;
    private final ModelUploadRepository uploadRepository;
    private final ModelArtifactStorageGateway storageGateway;

    public ModelUploadService(ModelUploadRepository uploadRepository, ModelArtifactStorageGateway storageGateway) {
        this.uploadRepository = uploadRepository;
        this.storageGateway = storageGateway;
    }

    public ModelUpload createUpload(Long requesterUserId, String fileName, String expectedSha256,
                                    Long maxBytes, OffsetDateTime expiresAt, OffsetDateTime now) {
        if (fileName == null || fileName.isBlank() || fileName.length() > 200
                || fileName.contains("/") || fileName.contains("\\")
                || ".".equals(fileName) || "..".equals(fileName)) {
            throw new IllegalArgumentException("fileName must be a safe leaf name with at most 200 characters");
        }
        UUID id = UUID.randomUUID();
        String safeName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        String objectKey = "models/uploads/" + id + "/" + safeName;
        return createUpload(new ModelUpload(id, requesterUserId, objectKey, expectedSha256, maxBytes,
                ModelUploadStatus.CREATED, expiresAt, null, now));
    }

    public ModelUpload createUpload(ModelUpload upload) {
        if (upload == null || upload.getId() == null || upload.getRequestedByUserId() == null) {
            throw new IllegalArgumentException("Upload and requester identity are required");
        }
        if (upload.getObjectKey() == null || upload.getObjectKey().isBlank()) {
            throw new IllegalArgumentException("objectKey must not be null or blank");
        }
        if (!isValidSha256(upload.getExpectedSha256())) {
            throw new IllegalArgumentException("expectedSha256 must be a 64-character lowercase hexadecimal string");
        }
        if (upload.getMaxBytes() == null || upload.getMaxBytes() <= 0
                || upload.getMaxBytes() > SERVER_MAX_UPLOAD_BYTES) {
            throw new IllegalArgumentException("maxBytes must be positive and at most the server upload limit");
        }
        if (upload.getStatus() != ModelUploadStatus.CREATED) {
            throw new IllegalArgumentException("Initial upload status must be CREATED");
        }
        if (upload.getCreatedAt() == null || upload.getExpiresAt() == null
                || !upload.getExpiresAt().isAfter(upload.getCreatedAt())) {
            throw new IllegalArgumentException("expiresAt must be strictly after createdAt");
        }
        if (uploadRepository.existsByObjectKey(upload.getObjectKey())) {
            throw new IllegalArgumentException("Duplicate objectKey: " + upload.getObjectKey());
        }
        return uploadRepository.save(upload);
    }

    public ModelUpload uploadContent(UUID uploadId, Long requesterUserId, InputStream content, OffsetDateTime now) {
        if (uploadId == null || requesterUserId == null || content == null || now == null) {
            throw new IllegalArgumentException("uploadId, requesterUserId, content, and now are required");
        }
        ModelUpload upload = get(uploadId);
        requireOwner(upload, requesterUserId);
        requireState(upload, ModelUploadStatus.CREATED, "MODEL_UPLOAD_CONTENT_CONFLICT");
        requireNotExpired(upload, now);

        Path temporary = null;
        boolean storageAttempted = false;
        try {
            temporary = Files.createTempFile("model-upload-", ".bin");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytes = 0;
            try (var output = Files.newOutputStream(temporary)) {
                byte[] buffer = new byte[8192];
                for (int read; (read = content.read(buffer)) >= 0; ) {
                    bytes += read;
                    if (bytes > Math.min(upload.getMaxBytes(), SERVER_MAX_UPLOAD_BYTES)) {
                        throw new UploadIntegrityException("MODEL_UPLOAD_TOO_LARGE");
                    }
                    digest.update(buffer, 0, read);
                    output.write(buffer, 0, read);
                }
            }
            String sha256 = HexFormat.of().formatHex(digest.digest());
            if (!sha256.equals(upload.getExpectedSha256())) {
                throw new UploadIntegrityException("MODEL_UPLOAD_HASH_MISMATCH");
            }

            storageAttempted = true;
            storageGateway.store(upload.getObjectKey(), temporary, bytes);
            ModelArtifactStorageGateway.Inspection inspection = storageGateway.inspect(upload.getObjectKey());
            if (inspection.bytes() != bytes || !inspection.sha256().equals(sha256)) {
                throw new UploadIntegrityException("MODEL_UPLOAD_PERSISTED_INTEGRITY_MISMATCH");
            }
            upload.markUploaded(inspection.sha256(), inspection.bytes(), now);
            return uploadRepository.save(upload);
        } catch (UploadIntegrityException | StorageUnavailableException exception) {
            if (storageAttempted) {
                safelyDelete(upload.getObjectKey());
            }
            throw exception;
        } catch (Exception exception) {
            throw new StorageUnavailableException(exception);
        } finally {
            if (temporary != null) {
                try {
                    Files.deleteIfExists(temporary);
                } catch (Exception ignored) {
                    // The verified upload result does not depend on temporary-file cleanup.
                }
            }
        }
    }

    public ModelUpload complete(UUID uploadId, Long requesterUserId, OffsetDateTime now) {
        if (uploadId == null || requesterUserId == null || now == null) {
            throw new IllegalArgumentException("uploadId, requesterUserId, and now must not be null");
        }
        ModelUpload upload = get(uploadId);
        requireOwner(upload, requesterUserId);
        requireState(upload, ModelUploadStatus.UPLOADED, "MODEL_UPLOAD_COMPLETE_CONFLICT");
        requireNotExpired(upload, now);
        verifyPersisted(upload);
        upload.markCompleted(now);
        return uploadRepository.save(upload);
    }

    @Transactional(readOnly = true)
    public ModelUpload requireCompleted(UUID uploadId, Long requesterUserId) {
        if (requesterUserId == null) {
            throw new IllegalArgumentException("requesterUserId is required");
        }
        ModelUpload upload = get(uploadId);
        requireOwner(upload, requesterUserId);
        requireState(upload, ModelUploadStatus.COMPLETED, "MODEL_UPLOAD_NOT_COMPLETED");
        verifyPersisted(upload);
        return upload;
    }

    public ModelUpload fail(UUID uploadId, OffsetDateTime now) {
        if (uploadId == null || now == null) {
            throw new IllegalArgumentException("uploadId and now must not be null");
        }
        ModelUpload upload = get(uploadId);
        requireState(upload, ModelUploadStatus.CREATED, "MODEL_UPLOAD_STATE_CONFLICT");
        upload.markFailed();
        return uploadRepository.save(upload);
    }

    public ModelUpload expire(UUID uploadId, OffsetDateTime now) {
        if (uploadId == null || now == null) {
            throw new IllegalArgumentException("uploadId and now must not be null");
        }
        ModelUpload upload = get(uploadId);
        requireState(upload, ModelUploadStatus.CREATED, "MODEL_UPLOAD_STATE_CONFLICT");
        if (now.isBefore(upload.getExpiresAt())) {
            throw new UploadConflictException("MODEL_UPLOAD_NOT_EXPIRED");
        }
        upload.markExpired();
        return uploadRepository.save(upload);
    }

    private ModelUpload get(UUID uploadId) {
        return uploadRepository.findById(uploadId)
                .orElseThrow(() -> new IllegalArgumentException("ModelUpload not found: " + uploadId));
    }

    private void verifyPersisted(ModelUpload upload) {
        if (upload.getObservedSha256() == null || upload.getObservedBytes() == null || upload.getStoredAt() == null) {
            throw new UploadIntegrityException("MODEL_UPLOAD_INTEGRITY_NOT_RECORDED");
        }
        ModelArtifactStorageGateway.Inspection inspection = storageGateway.inspect(upload.getObjectKey());
        if (!inspection.sha256().equals(upload.getExpectedSha256())
                || !inspection.sha256().equals(upload.getObservedSha256())
                || inspection.bytes() != upload.getObservedBytes()
                || inspection.bytes() > upload.getMaxBytes()) {
            throw new UploadIntegrityException("MODEL_UPLOAD_PERSISTED_INTEGRITY_MISMATCH");
        }
    }

    private void requireNotExpired(ModelUpload upload, OffsetDateTime now) {
        if (!now.isBefore(upload.getExpiresAt())) {
            throw new UploadConflictException("MODEL_UPLOAD_EXPIRED");
        }
    }

    private void requireState(ModelUpload upload, ModelUploadStatus expected, String code) {
        if (upload.getStatus() != expected) {
            throw new UploadConflictException(code);
        }
    }

    private void requireOwner(ModelUpload upload, Long requesterUserId) {
        if (!requesterUserId.equals(upload.getRequestedByUserId())) {
            throw new UploadOwnershipException();
        }
    }

    private void safelyDelete(String objectKey) {
        try {
            storageGateway.delete(objectKey);
        } catch (RuntimeException ignored) {
            // Preserve the integrity failure as the primary API result.
        }
    }

    private static boolean isValidSha256(String hash) {
        return hash != null && hash.matches("^[0-9a-f]{64}$");
    }

    public static class UploadConflictException extends RuntimeException {
        private final String code;
        public UploadConflictException(String code) { this.code = code; }
        public String code() { return code; }
    }

    public static class UploadIntegrityException extends RuntimeException {
        private final String code;
        public UploadIntegrityException(String code) { this.code = code; }
        public String code() { return code; }
    }

    public static class UploadOwnershipException extends RuntimeException { }

    public static class StorageUnavailableException extends RuntimeException {
        public StorageUnavailableException() { }
        public StorageUnavailableException(Throwable cause) { super(cause); }
    }
}
