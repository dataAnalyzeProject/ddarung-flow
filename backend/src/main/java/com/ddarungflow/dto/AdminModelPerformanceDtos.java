package com.ddarungflow.dto;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
public final class AdminModelPerformanceDtos {
    private AdminModelPerformanceDtos() { }
    public record Response(String artifactSha256, String modelVersion, OffsetDateTime generatedAt, JsonNode evaluation, JsonNode combinations, JsonNode segments, JsonNode calibrationBins) { }
    public record ErrorResponse(String code, String message) { }
}
