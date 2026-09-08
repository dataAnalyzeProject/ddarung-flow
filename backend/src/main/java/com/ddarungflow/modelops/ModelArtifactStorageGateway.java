package com.ddarungflow.modelops;

import java.nio.file.Path;

public interface ModelArtifactStorageGateway {
    void store(String objectKey, Path verifiedSource, long contentLength);
    Inspection inspect(String objectKey);
    void delete(String objectKey);

    record Inspection(long bytes, String sha256) { }
}
