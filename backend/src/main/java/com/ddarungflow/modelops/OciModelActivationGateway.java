package com.ddarungflow.modelops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.objectstorage.ObjectStorageClient;
import com.oracle.bmc.objectstorage.requests.PutObjectRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class OciModelActivationGateway implements ModelActivationGateway {
    private final String namespace;
    private final String bucket;
    private final URI reloadUri;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OciModelActivationGateway(
        @Value("${model.activation.oci-namespace:${OCI_OBJECT_NAMESPACE:}}") String namespace,
        @Value("${model.activation.bucket:${MODEL_BUCKET:}}") String bucket,
        @Value("${model.activation.inference-base-url:http://inference:8081}") String inferenceBaseUrl,
        ObjectMapper objectMapper
    ) {
        this.namespace = namespace;
        this.bucket = bucket;
        this.reloadUri = URI.create(inferenceBaseUrl.replaceAll("/+$", "") + "/internal/model-reloads");
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    @Override
    public void activate(ModelArtifact artifact) {
        if (namespace.isBlank() || bucket.isBlank() || artifact.getManifestKey() == null || artifact.getManifestSha256() == null) {
            throw new ModelActivationService.ActivationFailedException();
        }
        try {
            String pointerKey = "models/active/" + artifact.getId() + "-" + UUID.randomUUID() + ".json";
            byte[] pointer = objectMapper.writeValueAsBytes(Map.of(
                "schema_version", 1,
                "state", "ACTIVE",
                "model_version", artifact.getVersion(),
                "artifact", Map.of("key", artifact.getArtifactKey(), "sha256", artifact.getSha256()),
                "manifest", Map.of("key", artifact.getManifestKey(), "sha256", artifact.getManifestSha256()),
                "support", Map.of("horizon_minutes", List.of(60, 120, 180, 240), "required_bike_counts", List.of(1, 2, 3, 4, 5), "combination_count", 20)
            ));
            String pointerSha256 = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(pointer));
            try (ObjectStorageClient client = ObjectStorageClient.builder().build(InstancePrincipalsAuthenticationDetailsProvider.builder().build())) {
                client.putObject(PutObjectRequest.builder().namespaceName(namespace).bucketName(bucket).objectName(pointerKey)
                    .ifNoneMatch("*").contentLength((long) pointer.length).putObjectBody(new ByteArrayInputStream(pointer)).build());
            }
            String payload = objectMapper.writeValueAsString(Map.of("pointerKey", pointerKey, "pointerSha256", pointerSha256));
            HttpResponse<String> response = httpClient.send(HttpRequest.newBuilder(reloadUri).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8)).build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new ModelActivationService.ActivationFailedException();
            }
        } catch (ModelActivationService.ActivationFailedException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ModelActivationService.ActivationFailedException();
        }
    }
}
