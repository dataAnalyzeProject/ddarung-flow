package com.ddarungflow.modelops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.objectstorage.ObjectStorageClient;
import com.oracle.bmc.objectstorage.requests.GetObjectRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.function.Supplier;

@Component
@Profile("oci")
public class OciRuntimeModelSourceGateway implements RuntimeModelSourceGateway {
    private static final int MAX_METADATA_BYTES = 5 * 1024 * 1024;
    private final String namespace;
    private final String bucket;
    private final String pointerKey;
    private final String pointerSha256;
    private final ObjectMapper objectMapper;
    private final Supplier<ObjectStorageClient> clientSupplier;

    @Autowired
    public OciRuntimeModelSourceGateway(
        @Value("${model.activation.oci-namespace:${OCI_OBJECT_NAMESPACE:}}") String namespace,
        @Value("${model.activation.bucket:${MODEL_BUCKET:}}") String bucket,
        @Value("${model.runtime.pointer-key:${MODEL_POINTER_KEY:}}") String pointerKey,
        @Value("${model.runtime.pointer-sha256:${MODEL_POINTER_SHA256:}}") String pointerSha256,
        ObjectMapper objectMapper
    ) {
        this.namespace = namespace;
        this.bucket = bucket;
        this.pointerKey = pointerKey;
        this.pointerSha256 = pointerSha256;
        this.objectMapper = objectMapper;
        this.clientSupplier = () -> ObjectStorageClient.builder().build(
            InstancePrincipalsAuthenticationDetailsProvider.builder().build());
    }

    OciRuntimeModelSourceGateway(
        String namespace, String bucket, String pointerKey, String pointerSha256,
        ObjectMapper objectMapper, Supplier<ObjectStorageClient> clientSupplier
    ) {
        this.namespace = namespace;
        this.bucket = bucket;
        this.pointerKey = pointerKey;
        this.pointerSha256 = pointerSha256;
        this.objectMapper = objectMapper;
        this.clientSupplier = clientSupplier;
    }

    @Override
    public Source read() {
        if (namespace.isBlank() || bucket.isBlank() || pointerKey.isBlank() || !sha256(pointerSha256)) {
            throw new UnavailableException();
        }
        try (ObjectStorageClient client = clientSupplier.get()) {
            byte[] pointerBytes = read(client, pointerKey, pointerSha256);
            JsonNode pointer = objectMapper.readTree(pointerBytes);
            String state = text(pointer, "state");
            if (pointer.path("schema_version").asInt(-1) != 1
                    || !("INACTIVE".equals(state) || "ACTIVE".equals(state))) {
                throw new UnavailableException();
            }
            JsonNode artifact = pointer.path("artifact");
            JsonNode manifest = pointer.path("manifest");
            String modelVersion = text(pointer, "model_version");
            String artifactKey = text(artifact, "key");
            String artifactSha = text(artifact, "sha256");
            String manifestKey = text(manifest, "key");
            String manifestSha = text(manifest, "sha256");
            if (modelVersion.isBlank() || artifactKey.isBlank() || manifestKey.isBlank()
                    || !sha256(artifactSha) || !sha256(manifestSha)) {
                throw new UnavailableException();
            }
            JsonNode manifestBody = objectMapper.readTree(read(client, manifestKey, manifestSha));
            if (!artifactSha.equals(text(manifestBody, "artifact_sha256"))) {
                throw new UnavailableException();
            }
            return new Source(modelVersion, artifactKey, artifactSha, manifestKey, manifestSha, state);
        } catch (UnavailableException error) {
            throw error;
        } catch (Exception error) {
            throw new UnavailableException();
        }
    }

    private byte[] read(ObjectStorageClient client, String key, String expectedSha) throws Exception {
        try (InputStream input = client.getObject(GetObjectRequest.builder()
                .namespaceName(namespace).bucketName(bucket).objectName(key).build()).getInputStream()) {
            byte[] body = input.readNBytes(MAX_METADATA_BYTES + 1);
            if (body.length > MAX_METADATA_BYTES) throw new UnavailableException();
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
            if (!expectedSha.equals(actual)) throw new UnavailableException();
            return body;
        }
    }

    private String text(JsonNode node, String field) {
        return node.path(field).isTextual() ? node.path(field).asText() : "";
    }

    private boolean sha256(String value) {
        return value != null && value.matches("^[0-9a-f]{64}$");
    }
}
