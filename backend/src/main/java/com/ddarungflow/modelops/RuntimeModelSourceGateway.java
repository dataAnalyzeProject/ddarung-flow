package com.ddarungflow.modelops;

public interface RuntimeModelSourceGateway {
    Source read();

    record Source(
        String modelVersion,
        String artifactKey,
        String artifactSha256,
        String manifestKey,
        String manifestSha256,
        String pointerState
    ) { }

    class UnavailableException extends RuntimeException { }
}
