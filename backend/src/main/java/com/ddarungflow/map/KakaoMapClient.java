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
import org.springframework.beans.factory.annotation.Value;

@org.springframework.stereotype.Component
public class KakaoMapClient {

    private final String baseUrl;
    private final String apiKey;
    private final Function<HttpRequest, HttpResponse<String>> httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @org.springframework.beans.factory.annotation.Autowired
    public KakaoMapClient(
        @Value("${kakao.rest.base-url:https://dapi.kakao.com}") String baseUrl,
        @Value("${KAKAO_REST_API_KEY:}") String apiKey
    ) {
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

    public MapApiDtos.PlaceSearchPageResponseDto searchPlaces(String query, int page, int size) {
        String trimmedQuery = query.trim();
        try {
            String encodedQuery = java.net.URLEncoder.encode(trimmedQuery, java.nio.charset.StandardCharsets.UTF_8);
            String url = baseUrl + "/v2/local/search/keyword.json?query=" + encodedQuery
                + "&page=" + page + "&size=" + size;

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "KakaoAK " + apiKey)
                .GET()
                .build();

            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                throw new ProviderException("PLACE_PROVIDER_ERROR");
            }

            return parsePlacesResponse(response.body(), page);
        } catch (ProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new ProviderException("PLACE_PROVIDER_ERROR");
        }
    }

    public List<MapApiDtos.PlaceSearchResponseDto> searchPlaces(String query) {
        if (query == null || query.trim().length() < 2) {
            return List.of();
        }
        return searchPlaces(query, 1, 10).places();
    }

    public List<MapApiDtos.PlaceSearchResponseDto> parsePlacesResponse(String jsonResponse) {
        return parsePlacesResponse(jsonResponse, 1).places();
    }

    public MapApiDtos.PlaceSearchPageResponseDto parsePlacesResponse(String jsonResponse, int page) {
        if (jsonResponse == null || jsonResponse.isBlank()) {
            throw new ProviderException("PLACE_PROVIDER_ERROR");
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
            boolean hasNext = !root.path("meta").path("is_end").asBoolean(true);
            return new MapApiDtos.PlaceSearchPageResponseDto(List.copyOf(list), page, hasNext);
        } catch (ProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new ProviderException("PLACE_PROVIDER_ERROR");
        }
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
            boolean publicTransit = mode.equalsIgnoreCase("TRANSIT") || mode.equalsIgnoreCase("PUBLIC_TRANSIT");
            String modePath = publicTransit ? "publictraffic" : "walk";
            String url = String.format(
                "%s/v2/routing/%s?start_x=%s&start_y=%s&end_x=%s&end_y=%s",
                baseUrl, modePath, originLng, originLat, destLng, destLat
            );

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "KakaoAK " + apiKey)
                .GET()
                .build();

            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                throw new ProviderException("ROUTE_PROVIDER_ERROR");
            }

            java.util.Optional<MapApiDtos.RouteResultDto> result = parseRouteResponse(response.body(), mode);
            if (result.isEmpty()) {
                throw new ProviderException("ROUTE_PROVIDER_ERROR");
            }
            return result;
        } catch (ProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new ProviderException("ROUTE_PROVIDER_ERROR");
        }
    }

    public java.util.Optional<MapApiDtos.RouteResultDto> parseRouteResponse(String jsonResponse, String travelMode) {
        if (jsonResponse == null || jsonResponse.isBlank()) {
            return java.util.Optional.empty();
        }

        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            if (root.hasNonNull("status") && !"OK".equals(root.path("status").asText())) {
                return java.util.Optional.empty();
            }

            boolean publicTransit = "TRANSIT".equalsIgnoreCase(travelMode)
                || "PUBLIC_TRANSIT".equalsIgnoreCase(travelMode);
            JsonNode routeProperties;
            JsonNode selectedRoute;
            if (publicTransit) {
                JsonNode routes = root.path("routes");
                routeProperties = null;
                selectedRoute = null;
                if (routes.isArray()) {
                    for (JsonNode route : routes) {
                        JsonNode candidate = route.path("properties");
                        JsonNode candidateDistance = candidate.get("totalDistance");
                        JsonNode candidateDuration = candidate.get("totalTime");
                        if (candidateDistance == null || candidateDistance.isNull()
                            || candidateDuration == null || candidateDuration.isNull()
                            || candidateDistance.asInt(-1) < 0 || candidateDuration.asInt(-1) < 0) {
                            continue;
                        }
                        if (routeProperties == null
                            || candidateDuration.asInt() < routeProperties.path("totalTime").asInt()) {
                            routeProperties = candidate;
                            selectedRoute = route;
                        }
                    }
                }
            } else {
                selectedRoute = root.path("route");
                routeProperties = selectedRoute.path("properties");
            }

            if (routeProperties == null) {
                return java.util.Optional.empty();
            }
            JsonNode distNode = routeProperties.get("totalDistance");
            JsonNode durNode = routeProperties.get("totalTime");

            if (distNode == null || distNode.isNull() || durNode == null || durNode.isNull()) {
                return java.util.Optional.empty();
            }

            int distanceMeters = distNode.asInt(-1);
            int durationSeconds = durNode.asInt(-1);

            if (distanceMeters < 0 || durationSeconds < 0) {
                return java.util.Optional.empty();
            }

            return java.util.Optional.of(new MapApiDtos.RouteResultDto(
                distanceMeters,
                durationSeconds,
                travelMode,
                extractPathPoints(selectedRoute, publicTransit)
            ));
        } catch (Exception e) {
            return java.util.Optional.empty();
        }
    }

    public int calculateWalkDurationSeconds(double distanceMeters) {
        // Assume average walk speed of 80m/min -> convert to seconds
        return (int) Math.round((distanceMeters / 80.0) * 60.0);
    }

    private List<MapApiDtos.RoutePointDto> extractPathPoints(JsonNode route, boolean publicTransit) {
        List<MapApiDtos.RoutePointDto> points = new ArrayList<>();
        if (route == null || route.isMissingNode()) return points;
        if (publicTransit) {
            appendStepPoints(route.path("steps"), points);
        } else {
            for (JsonNode leg : route.path("legs")) appendStepPoints(leg.path("steps"), points);
        }
        return points;
    }

    private void appendStepPoints(JsonNode steps, List<MapApiDtos.RoutePointDto> target) {
        if (!steps.isArray()) return;
        for (JsonNode step : steps) {
            JsonNode coordinates = step.path("path").path("points");
            if (!coordinates.isArray()) continue;
            for (JsonNode coordinate : coordinates) {
                if (!coordinate.isArray() || coordinate.size() < 2 || !coordinate.get(0).isNumber() || !coordinate.get(1).isNumber()) continue;
                target.add(new MapApiDtos.RoutePointDto(
                    coordinate.get(1).decimalValue(),
                    coordinate.get(0).decimalValue()
                ));
            }
        }
    }

    public static class ProviderException extends RuntimeException {
        private final String code;

        public ProviderException(String code) {
            super(code);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
