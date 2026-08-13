package com.ddarungflow.map;

import com.ddarungflow.inventory.InventoryMapper;
import com.ddarungflow.inventory.InventoryResult;
import com.ddarungflow.inventory.InventoryStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.function.Function;

public class SeoulBikeClient {

    private final String baseUrl;
    private final String apiKey;
    private final InventoryMapper inventoryMapper;
    private final Function<HttpRequest, HttpResponse<String>> httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SeoulBikeClient(String baseUrl, String apiKey, InventoryMapper inventoryMapper) {
        this(baseUrl, apiKey, inventoryMapper, defaultTransport());
    }

    public SeoulBikeClient(
        String baseUrl,
        String apiKey,
        InventoryMapper inventoryMapper,
        Function<HttpRequest, HttpResponse<String>> httpTransport
    ) {
        this.baseUrl = baseUrl != null ? baseUrl : "http://openapi.seoul.go.kr:8088";
        this.apiKey = apiKey != null ? apiKey : "";
        this.inventoryMapper = inventoryMapper != null ? inventoryMapper : new InventoryMapper();
        this.httpTransport = httpTransport != null ? httpTransport : defaultTransport();
    }

    private static Function<HttpRequest, HttpResponse<String>> defaultTransport() {
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
        return request -> {
            try {
                return client.send(request, HttpResponse.BodyHandlers.ofString());
            } catch (Exception e) {
                throw new RuntimeException("SeoulBike API request failed", e);
            }
        };
    }

    public Optional<InventoryResult> fetchInventory(String stationId) {
        if (stationId == null || stationId.isBlank()) {
            return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
        }

        try {
            String url = baseUrl + "/" + apiKey + "/json/bikeList/1/5/";
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .build();

            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.UNAVAILABLE));
            }

            return parseAndMapResponse(stationId, response.body());
        } catch (Exception e) {
            return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.UNAVAILABLE));
        }
    }

    public Optional<InventoryResult> parseAndMapResponse(String stationId, String jsonResponse) {
        if (jsonResponse == null || jsonResponse.isBlank()) {
            return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
        }

        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode rentBikeStatus = root.path("rentBikeStatus");

            // 1. Check provider RESULT.CODE
            JsonNode resultCodeNode = rentBikeStatus.path("RESULT").path("CODE");
            if (!resultCodeNode.isMissingNode() && !resultCodeNode.asText("").startsWith("INFO-000")) {
                // Return approved failure status (UNAVAILABLE) on provider failure code
                return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.UNAVAILABLE));
            }

            JsonNode rowArray = rentBikeStatus.path("row");
            if (!rowArray.isArray() || rowArray.isEmpty()) {
                return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
            }

            // 2. Strictly match stationId (Do NOT fall back to row 0 for a different stationId)
            JsonNode targetRow = null;
            for (JsonNode row : rowArray) {
                String rowStationId = row.path("stationId").asText(null);
                if (stationId.equalsIgnoreCase(rowStationId)) {
                    targetRow = row;
                    break;
                }
            }

            if (targetRow == null) {
                return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
            }

            JsonNode countNode = targetRow.get("parkingBikeTotCnt");
            if (countNode == null || countNode.isNull() || countNode.asText().isBlank()) {
                return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
            }

            Integer bikeCount = Integer.parseInt(countNode.asText().trim());
            OffsetDateTime collectedAt = OffsetDateTime.now();
            return fetchInventory(stationId, bikeCount, collectedAt, true, false);
        } catch (Exception e) {
            return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
        }
    }

    public Optional<InventoryResult> fetchInventory(String stationId, Integer rawCount, OffsetDateTime rawCollectedAt, boolean sourceAvailable, boolean delayed) {
        try {
            InventoryResult result = inventoryMapper.map(stationId, rawCount, rawCollectedAt, sourceAvailable, delayed);
            return Optional.of(result);
        } catch (IllegalArgumentException e) {
            return Optional.of(new InventoryResult(stationId, null, null, InventoryStatus.MISSING));
        }
    }
}
