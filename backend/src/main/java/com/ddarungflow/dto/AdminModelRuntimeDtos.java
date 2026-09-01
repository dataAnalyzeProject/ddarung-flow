package com.ddarungflow.dto;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminModelRuntimeDtos {
    private AdminModelRuntimeDtos() { }

    public record Response(
        String status,
        String modelVersion,
        String artifactSha256,
        String modelSource,
        OffsetDateTime loadedAt,
        List<Integer> supportedHorizons,
        List<Integer> supportedQuantities
    ) { }

    public record ErrorResponse(String code, String message) { }
}
