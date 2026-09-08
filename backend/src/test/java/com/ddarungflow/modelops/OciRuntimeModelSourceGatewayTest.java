package com.ddarungflow.modelops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oracle.bmc.objectstorage.ObjectStorageClient;
import com.oracle.bmc.objectstorage.responses.GetObjectResponse;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OciRuntimeModelSourceGatewayTest {
    private static final String POINTER_KEY = "private/pointer.json";
    private static final String MANIFEST_KEY = "private/manifest.json";
    private static final String ARTIFACT_SHA = "a".repeat(64);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void ociProfileSelectsTheProductionConstructor() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("oci");
            context.registerBean("objectMapper", ObjectMapper.class, () -> new ObjectMapper());
            context.register(OciRuntimeModelSourceGateway.class);
            context.refresh();

            assertThat(context.getBean(OciRuntimeModelSourceGateway.class)).isNotNull();
        }
    }

    @Test
    void readsVerifiedInactiveAndActiveSources() throws Exception {
        for (String state : new String[] {"INACTIVE", "ACTIVE"}) {
            byte[] manifest = json(Map.of("artifact_sha256", ARTIFACT_SHA));
            byte[] pointer = pointer(state, sha(manifest), ARTIFACT_SHA, 1);
            ObjectStorageClient client = storage(Map.of(POINTER_KEY, pointer, MANIFEST_KEY, manifest));

            RuntimeModelSourceGateway.Source source = gateway(client, pointer, sha(pointer)).read();

            assertThat(source.pointerState()).isEqualTo(state);
            assertThat(source.modelVersion()).isEqualTo("runtime-v1");
            assertThat(source.artifactSha256()).isEqualTo(ARTIFACT_SHA);
            verify(client).close();
        }
    }

    @Test
    void failsClosedForPointerShaMismatch() throws Exception {
        byte[] manifest = json(Map.of("artifact_sha256", ARTIFACT_SHA));
        byte[] pointer = pointer("INACTIVE", sha(manifest), ARTIFACT_SHA, 1);
        ObjectStorageClient client = storage(Map.of(POINTER_KEY, pointer));

        assertUnavailable(gateway(client, pointer, "f".repeat(64)));
        verify(client).close();
    }

    @Test
    void failsClosedForManifestShaOrArtifactMismatch() throws Exception {
        byte[] manifest = json(Map.of("artifact_sha256", ARTIFACT_SHA));
        byte[] wrongManifestShaPointer = pointer("INACTIVE", "b".repeat(64), ARTIFACT_SHA, 1);
        assertUnavailable(gateway(storage(Map.of(POINTER_KEY, wrongManifestShaPointer, MANIFEST_KEY, manifest)),
            wrongManifestShaPointer, sha(wrongManifestShaPointer)));

        byte[] mismatchedManifest = json(Map.of("artifact_sha256", "c".repeat(64)));
        byte[] pointer = pointer("ACTIVE", sha(mismatchedManifest), ARTIFACT_SHA, 1);
        assertUnavailable(gateway(storage(Map.of(POINTER_KEY, pointer, MANIFEST_KEY, mismatchedManifest)),
            pointer, sha(pointer)));
    }

    @Test
    void failsClosedForInvalidSchemaOrState() throws Exception {
        byte[] manifest = json(Map.of("artifact_sha256", ARTIFACT_SHA));
        for (byte[] pointer : new byte[][] {
            pointer("INACTIVE", sha(manifest), ARTIFACT_SHA, 2),
            pointer("UNKNOWN", sha(manifest), ARTIFACT_SHA, 1)
        }) {
            assertUnavailable(gateway(storage(Map.of(POINTER_KEY, pointer)), pointer, sha(pointer)));
        }
    }

    @Test
    void failsClosedBeforeParsingMetadataLargerThanFiveMiB() throws Exception {
        byte[] oversized = new byte[5 * 1024 * 1024 + 1];
        ObjectStorageClient client = storage(Map.of(POINTER_KEY, oversized));

        assertUnavailable(gateway(client, oversized, sha(oversized)));
        verify(client).close();
    }

    private OciRuntimeModelSourceGateway gateway(ObjectStorageClient client, byte[] ignored, String pointerSha) {
        return new OciRuntimeModelSourceGateway(
            "namespace", "bucket", POINTER_KEY, pointerSha, objectMapper, () -> client);
    }

    private ObjectStorageClient storage(Map<String, byte[]> objects) {
        ObjectStorageClient client = mock(ObjectStorageClient.class);
        when(client.getObject(any())).thenAnswer(invocation -> {
            com.oracle.bmc.objectstorage.requests.GetObjectRequest request = invocation.getArgument(0);
            byte[] body = objects.get(request.getObjectName());
            if (body == null) throw new IllegalStateException("missing object");
            return GetObjectResponse.builder().inputStream(new ByteArrayInputStream(body)).build();
        });
        return client;
    }

    private byte[] pointer(String state, String manifestSha, String artifactSha, int schemaVersion) throws Exception {
        return json(Map.of(
            "schema_version", schemaVersion,
            "state", state,
            "model_version", "runtime-v1",
            "artifact", Map.of("key", "private/model.bin", "sha256", artifactSha),
            "manifest", Map.of("key", MANIFEST_KEY, "sha256", manifestSha)
        ));
    }

    private byte[] json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value).getBytes(StandardCharsets.UTF_8);
    }

    private String sha(byte[] value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private void assertUnavailable(OciRuntimeModelSourceGateway gateway) {
        assertThatThrownBy(gateway::read).isInstanceOf(RuntimeModelSourceGateway.UnavailableException.class);
    }
}
