package com.ddarungflow.modelops;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
@Profile("!oci")
public class LocalModelArtifactStorageGateway implements ModelArtifactStorageGateway {
    private final Path root;

    public LocalModelArtifactStorageGateway(
            @Value("${model.upload.local-root:${MODEL_UPLOAD_LOCAL_ROOT:./data/model-uploads}}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @Override
    public void store(String objectKey, Path verifiedSource, long contentLength) {
        Path target = resolve(objectKey);
        try {
            Files.createDirectories(target.getParent());
            Path temporary = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            try {
                Files.copy(verifiedSource, temporary, StandardCopyOption.REPLACE_EXISTING);
                if (Files.size(temporary) != contentLength) {
                    throw new ModelUploadService.StorageUnavailableException();
                }
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (ModelUploadService.StorageUnavailableException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    @Override
    public Inspection inspect(String objectKey) {
        Path target = resolve(objectKey);
        if (!Files.isRegularFile(target)) {
            throw new ModelUploadService.UploadIntegrityException("MODEL_UPLOAD_OBJECT_MISSING");
        }
        try (InputStream input = Files.newInputStream(target)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytes = 0;
            byte[] buffer = new byte[8192];
            for (int read; (read = input.read(buffer)) >= 0; ) {
                digest.update(buffer, 0, read);
                bytes += read;
            }
            return new Inspection(bytes, HexFormat.of().formatHex(digest.digest()));
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    @Override
    public void delete(String objectKey) {
        try {
            Files.deleteIfExists(resolve(objectKey));
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    private Path resolve(String objectKey) {
        Path resolved = root.resolve(objectKey).normalize();
        if (!resolved.startsWith(root)) {
            throw new ModelUploadService.UploadIntegrityException("MODEL_UPLOAD_OBJECT_KEY_INVALID");
        }
        return resolved;
    }
}
