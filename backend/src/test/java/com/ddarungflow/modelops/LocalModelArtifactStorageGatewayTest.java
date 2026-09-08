package com.ddarungflow.modelops;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LocalModelArtifactStorageGatewayTest {
    @TempDir Path root;

    @Test
    void storesInspectsAndDeletesVerifiedContent() throws Exception {
        byte[] content = "model-artifact".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Path source = Files.write(root.resolve("source.bin"), content);
        LocalModelArtifactStorageGateway gateway = new LocalModelArtifactStorageGateway(root.resolve("storage").toString());

        gateway.store("models/uploads/id/model.bin", source, content.length);
        ModelArtifactStorageGateway.Inspection inspection = gateway.inspect("models/uploads/id/model.bin");

        assertThat(inspection.bytes()).isEqualTo(content.length);
        assertThat(inspection.sha256()).isEqualTo(HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(content)));
        gateway.delete("models/uploads/id/model.bin");
        assertThatThrownBy(() -> gateway.inspect("models/uploads/id/model.bin"))
                .isInstanceOf(ModelUploadService.UploadIntegrityException.class);
    }

    @Test
    void rejectsObjectKeysOutsideConfiguredRoot() {
        LocalModelArtifactStorageGateway gateway = new LocalModelArtifactStorageGateway(root.toString());
        assertThatThrownBy(() -> gateway.inspect("../../outside.bin"))
                .isInstanceOf(ModelUploadService.UploadIntegrityException.class);
    }
}
