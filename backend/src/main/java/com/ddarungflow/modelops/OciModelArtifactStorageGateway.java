package com.ddarungflow.modelops;

import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.objectstorage.ObjectStorageClient;
import com.oracle.bmc.objectstorage.requests.DeleteObjectRequest;
import com.oracle.bmc.objectstorage.requests.GetObjectRequest;
import com.oracle.bmc.objectstorage.requests.PutObjectRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
@Profile("oci")
public class OciModelArtifactStorageGateway implements ModelArtifactStorageGateway {
    private final String namespace;
    private final String bucket;

    public OciModelArtifactStorageGateway(
            @Value("${model.upload.oci-namespace:${model.activation.oci-namespace:${OCI_OBJECT_NAMESPACE:}}}") String namespace,
            @Value("${model.upload.bucket:${model.activation.bucket:${MODEL_BUCKET:}}}") String bucket) {
        this.namespace = namespace;
        this.bucket = bucket;
    }

    @Override
    public void store(String objectKey, Path verifiedSource, long contentLength) {
        ensureConfigured();
        try (ObjectStorageClient client = client(); InputStream body = Files.newInputStream(verifiedSource)) {
            client.putObject(PutObjectRequest.builder()
                    .namespaceName(namespace).bucketName(bucket).objectName(objectKey)
                    .ifNoneMatch("*").contentLength(contentLength).putObjectBody(body).build());
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    @Override
    public Inspection inspect(String objectKey) {
        ensureConfigured();
        try (ObjectStorageClient client = client()) {
            var response = client.getObject(GetObjectRequest.builder()
                    .namespaceName(namespace).bucketName(bucket).objectName(objectKey).build());
            try (InputStream input = response.getInputStream()) {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long bytes = 0;
                byte[] buffer = new byte[8192];
                for (int read; (read = input.read(buffer)) >= 0; ) {
                    digest.update(buffer, 0, read);
                    bytes += read;
                }
                return new Inspection(bytes, HexFormat.of().formatHex(digest.digest()));
            }
        } catch (com.oracle.bmc.model.BmcException exception) {
            if (exception.getStatusCode() == 404) {
                throw new ModelUploadService.UploadIntegrityException("MODEL_UPLOAD_OBJECT_MISSING");
            }
            throw new ModelUploadService.StorageUnavailableException(exception);
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    @Override
    public void delete(String objectKey) {
        ensureConfigured();
        try (ObjectStorageClient client = client()) {
            client.deleteObject(DeleteObjectRequest.builder()
                    .namespaceName(namespace).bucketName(bucket).objectName(objectKey).build());
        } catch (com.oracle.bmc.model.BmcException exception) {
            if (exception.getStatusCode() != 404) {
                throw new ModelUploadService.StorageUnavailableException(exception);
            }
        } catch (Exception exception) {
            throw new ModelUploadService.StorageUnavailableException(exception);
        }
    }

    private ObjectStorageClient client() {
        return ObjectStorageClient.builder().build(
                InstancePrincipalsAuthenticationDetailsProvider.builder().build());
    }

    private void ensureConfigured() {
        if (namespace.isBlank() || bucket.isBlank()) {
            throw new ModelUploadService.StorageUnavailableException();
        }
    }
}
