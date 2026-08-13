package com.ddarungflow.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

@org.springframework.stereotype.Component
public class KakaoMapClient {

    private final String baseUrl;
    private final String apiKey;
    private final Function<HttpRequest, HttpResponse<String>> httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public KakaoMapClient() {
        this("https://dapi.kakao.com", "fake-key");
    }

    public KakaoMapClient(String baseUrl, String apiKey) {
        this(baseUrl, apiKey, defaultTransport());
    }

    public KakaoMapClient(String baseUrl, String apiKey, Function<HttpRequest, HttpResponse<String>> httpTransport) {
        this.baseUrl = baseUrl != null ? baseUrl : "https://dapi.kakao.com";
        this.apiKey = apiKey != null ? apiKey : "";
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
                throw new RuntimeException("Kakao API request failed", e);
            }
        };
    }

    public List<MapApiDtos.PlaceSearchResponseDto> searchPlaces(String query) {
        if (query == null || query.trim().length() < 2) {
            return List.of();
        }

        String trimmedQuery = query.trim();
        try {
            String encodedQuery = java.net.URLEncoder.encode(trimmedQuery, java.nio.charset.StandardCharsets.UTF_8);
            String url = baseUrl + "/v2/local/search/keyword.json?query=" + encodedQuery;

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "KakaoAK " + apiKey)
                .GET()
                .build();

            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                return List.of();
            }

            return parsePlacesResponse(response.body());
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<MapApiDtos.PlaceSearchResponseDto> parsePlacesResponse(String jsonResponse) {
        if (jsonResponse == null || jsonResponse.isBlank()) {
            return List.of();
        }

        List<MapApiDtos.PlaceSearchResponseDto> list = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode documents = root.path("documents");

            if (documents.isArray()) {
                for (JsonNode doc : documents) {
                    String id = doc.path("id").asText(null);
                    String name = doc.path("place_name").asText(null);
                    String address = doc.path("address_name").asText(null);
                    JsonNode xNode = doc.get("x");
                    JsonNode yNode = doc.get("y");

                    if (xNode == null || xNode.isNull() || xNode.asText().isBlank() ||
                        yNode == null || yNode.isNull() || yNode.asText().isBlank()) {
                        // Skip places where coordinates x or y are missing
                        continue;
                    }

                    BigDecimal longitude = new BigDecimal(xNode.asText());
                    BigDecimal latitude = new BigDecimal(yNode.asText());

                    list.add(new MapApiDtos.PlaceSearchResponseDto(id, name, address, latitude, longitude));
                }
            }
        } catch (Exception e) {
            return List.of();
        }
        return list;
    }

    public java.util.Optional<MapApiDtos.RouteResultDto> fetchRoute(
        BigDecimal originLat,
        BigDecimal originLng,
        BigDecimal destLat,
        BigDecimal destLng,
        String travelMode
    ) {
        if (originLat == null || originLng == null || destLat == null || destLng == null) {
            return java.util.Optional.empty();
        }

        String mode = (travelMode != null && !travelMode.isBlank()) ? travelMode.toUpperCase() : "WALK";
        try {
            String modePath = mode.equalsIgnoreCase("TRANSIT") ? "transit" : "walk";
            String url = String.format(
                "%s/v1/directions/%s?origin=%s,%s&destination=%s,%s",
                baseUrl, modePath, originLng, originLat, destLng, destLat
            );

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "KakaoAK " + apiKey)
                .GET()
                .build();

            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                return java.util.Optional.empty();
            }

            return parseRouteResponse(response.body(), mode);
        } catch (Exception e) {
            return java.util.Optional.empty();
        }
    }

    public java.util.Optional<MapApiDtos.RouteResultDto> parseRouteResponse(String jsonResponse, String travelMode) {
        if (jsonResponse == null || jsonResponse.isBlank()) {
            return java.util.Optional.empty();
        }

        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            JsonNode routes = root.path("routes");
            JsonNode targetRoute = routes.isArray() && !routes.isEmpty() ? routes.get(0) : root;

            JsonNode summary = targetRoute.path("summary");
            JsonNode distNode = summary.has("distance") ? summary.get("distance") : targetRoute.get("distance");
            JsonNode durNode = summary.has("duration") ? summary.get("duration") : targetRoute.get("duration");

            if (distNode == null || distNode.isNull() || durNode == null || durNode.isNull()) {
                return java.util.Optional.empty();
            }

            int distanceMeters = distNode.asInt(-1);
            int durationSeconds = durNode.asInt(-1);

            if (distanceMeters < 0 || durationSeconds < 0) {
                return java.util.Optional.empty();
            }

            return java.util.Optional.of(new MapApiDtos.RouteResultDto(distanceMeters, durationSeconds, travelMode));
        } catch (Exception e) {
            return java.util.Optional.empty();
        }
    }

    public int calculateWalkDurationSeconds(double distanceMeters) {
        // Assume average walk speed of 80m/min -> convert to seconds
        return (int) Math.round((distanceMeters / 80.0) * 60.0);
    }
}
