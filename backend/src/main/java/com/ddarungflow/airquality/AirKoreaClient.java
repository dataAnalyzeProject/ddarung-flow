package com.ddarungflow.airquality;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Component
public class AirKoreaClient {

    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private static final Duration CATALOG_TTL = Duration.ofHours(24);
    private static final Duration MEASUREMENT_TTL = Duration.ofMinutes(30);
    private static final Set<String> AIR_QUALITY_ITEMS = Set.of("PM10", "PM2.5", "O3");

    private final AirKoreaProperties properties;
    private final Function<HttpRequest, HttpResponse<String>> httpTransport;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private volatile CatalogCacheEntry catalogCache;
    private final ConcurrentHashMap<String, MeasurementCacheEntry> measurementCache = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public AirKoreaClient(AirKoreaProperties properties) {
        this(properties, defaultTransport());
    }

    public AirKoreaClient(AirKoreaProperties properties, Function<HttpRequest, HttpResponse<String>> httpTransport) {
        this.properties = properties;
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
                throw new RuntimeException("AirKorea API request failed", e);
            }
        };
    }

    public record AirKoreaStation(String stationName, BigDecimal latitude, BigDecimal longitude, List<String> measuredItems) {
        public boolean measuresAirQualityItem() {
            return measuredItems.stream().anyMatch(AIR_QUALITY_ITEMS::contains);
        }
    }

    public record MeasurementFetchResult(String latestJson, String previousJson, boolean latestFetchFailed, OffsetDateTime collectedAt) {
    }

    private record CatalogCacheEntry(List<AirKoreaStation> stations, Instant fetchedAt) {
    }

    private record MeasurementCacheEntry(String rawJson, Instant fetchedAt) {
    }

    public List<AirKoreaStation> fetchStationCatalog() {
        CatalogCacheEntry cached = catalogCache;
        Instant now = Instant.now();
        if (cached != null && cached.fetchedAt().plus(CATALOG_TTL).isAfter(now)) {
            return cached.stations();
        }

        List<AirKoreaStation> live = fetchStationCatalogLive();
        if (!live.isEmpty()) {
            catalogCache = new CatalogCacheEntry(live, now);
            return live;
        }
        return cached != null ? cached.stations() : List.of();
    }

    private List<AirKoreaStation> fetchStationCatalogLive() {
        try {
            String url = properties.baseUrl() + "/MsrstnInfoInqireSvc/getMsrstnList"
                    + "?serviceKey=" + properties.serviceKey()
                    + "&returnType=json&numOfRows=" + properties.catalogNumOfRows() + "&pageNo=1";
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                return List.of();
            }
            return parseCatalogResponse(response.body());
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<AirKoreaStation> parseCatalogResponse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode header = root.path("response").path("header");
            if (!"00".equals(header.path("resultCode").asText(""))) {
                return List.of();
            }
            JsonNode items = root.path("response").path("body").path("items");
            if (!items.isArray()) {
                return List.of();
            }
            List<AirKoreaStation> stations = new ArrayList<>();
            for (JsonNode item : items) {
                String stationName = textOrNull(item.path("stationName"));
                BigDecimal latitude = decimalOrNull(item.path("dmX"));
                BigDecimal longitude = decimalOrNull(item.path("dmY"));
                String itemField = textOrNull(item.path("item"));
                if (stationName == null || latitude == null || longitude == null) {
                    continue;
                }
                List<String> measuredItems = itemField == null
                        ? List.of()
                        : Arrays.stream(itemField.split(",")).map(String::trim).toList();
                stations.add(new AirKoreaStation(stationName, latitude, longitude, measuredItems));
            }
            return stations;
        } catch (Exception e) {
            return List.of();
        }
    }

    public MeasurementFetchResult fetchMeasurement(String stationName) {
        Instant now = Instant.now();
        MeasurementCacheEntry cached = measurementCache.get(stationName);
        if (cached != null && cached.fetchedAt().plus(MEASUREMENT_TTL).isAfter(now)) {
            return new MeasurementFetchResult(cached.rawJson(), null, false, toKst(cached.fetchedAt()));
        }

        String previousJson = cached != null ? cached.rawJson() : null;
        try {
            String url = properties.baseUrl() + "/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"
                    + "?serviceKey=" + properties.serviceKey()
                    + "&returnType=json&numOfRows=1&pageNo=1"
                    + "&stationName=" + URLEncoder.encode(stationName, StandardCharsets.UTF_8)
                    + "&dataTerm=DAILY&ver=1.3";
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
            HttpResponse<String> response = httpTransport.apply(request);
            if (response == null || response.statusCode() != 200) {
                return new MeasurementFetchResult(null, previousJson, true, toKst(now));
            }

            String body = response.body();
            if (isSuccessfulNonEmptyResponse(body)) {
                measurementCache.put(stationName, new MeasurementCacheEntry(body, now));
            }
            return new MeasurementFetchResult(body, previousJson, false, toKst(now));
        } catch (Exception e) {
            return new MeasurementFetchResult(null, previousJson, true, toKst(now));
        }
    }

    private boolean isSuccessfulNonEmptyResponse(String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode header = root.path("response").path("header");
            if (!"00".equals(header.path("resultCode").asText(""))) {
                return false;
            }
            JsonNode items = root.path("response").path("body").path("items");
            return items.isArray() && items.size() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static OffsetDateTime toKst(Instant instant) {
        return instant.atOffset(KST);
    }

    private static String textOrNull(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText().trim();
        return text.isBlank() ? null : text;
    }

    private static BigDecimal decimalOrNull(JsonNode node) {
        String text = textOrNull(node);
        if (text == null) {
            return null;
        }
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
