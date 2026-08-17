package com.ddarungflow.weather;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class KmaShortForecastClient implements WeatherForecastProvider {
    private static final ZoneOffset KST = ZoneOffset.ofHours(9);
    private static final String ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

    private final String serviceKey;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public KmaShortForecastClient(
        @Value("${KMA_SERVICE_KEY:}") String serviceKey,
        ObjectMapper objectMapper
    ) {
        this(serviceKey, HttpClient.newHttpClient(), objectMapper);
    }

    KmaShortForecastClient(String serviceKey, HttpClient httpClient, ObjectMapper objectMapper) {
        this.serviceKey = serviceKey;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<WeatherForecastSelector.ForecastPoint> fetch(int nx, int ny, OffsetDateTime requestedAt) {
        if (serviceKey == null || serviceKey.isBlank()) throw new WeatherProviderException("KMA service key is unavailable");
        try {
            OffsetDateTime baseAt = latestBaseAt(requestedAt);
            String query = "serviceKey=" + URLEncoder.encode(serviceKey, StandardCharsets.UTF_8)
                + "&pageNo=1&numOfRows=1000&dataType=JSON"
                + "&base_date=" + baseAt.toLocalDate().toString().replace("-", "")
                + "&base_time=" + String.format("%02d00", baseAt.getHour())
                + "&nx=" + nx + "&ny=" + ny;
            HttpRequest request = HttpRequest.newBuilder(URI.create(ENDPOINT + "?" + query)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new WeatherProviderException("KMA returned HTTP " + response.statusCode());
            return parse(response.body(), baseAt);
        } catch (WeatherProviderException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new WeatherProviderException("KMA forecast request failed", exception);
        }
    }

    static OffsetDateTime latestBaseAt(OffsetDateTime requestedAt) {
        LocalDateTime local = requestedAt.withOffsetSameInstant(KST).toLocalDateTime().minusMinutes(10);
        int[] baseHours = {2, 5, 8, 11, 14, 17, 20, 23};
        int selected = -1;
        for (int hour : baseHours) if (hour <= local.getHour()) selected = hour;
        if (selected < 0) return OffsetDateTime.of(local.toLocalDate().minusDays(1), LocalTime.of(23, 0), KST);
        return OffsetDateTime.of(local.toLocalDate(), LocalTime.of(selected, 0), KST);
    }

    private List<WeatherForecastSelector.ForecastPoint> parse(String body, OffsetDateTime issuedAt) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode header = root.path("response").path("header");
        if (!"00".equals(header.path("resultCode").asText())) throw new WeatherProviderException("KMA rejected request: " + header.path("resultMsg").asText());
        Map<OffsetDateTime, Map<String, String>> values = new HashMap<>();
        for (JsonNode item : root.path("response").path("body").path("items").path("item")) {
            String date = item.path("fcstDate").asText();
            String time = item.path("fcstTime").asText();
            if (date.length() != 8 || time.length() != 4) continue;
            OffsetDateTime forecastAt = OffsetDateTime.of(
                LocalDate.of(Integer.parseInt(date.substring(0, 4)), Integer.parseInt(date.substring(4, 6)), Integer.parseInt(date.substring(6, 8))),
                LocalTime.of(Integer.parseInt(time.substring(0, 2)), Integer.parseInt(time.substring(2, 4))), KST
            );
            values.computeIfAbsent(forecastAt, ignored -> new HashMap<>()).put(item.path("category").asText(), item.path("fcstValue").asText());
        }
        List<WeatherForecastSelector.ForecastPoint> points = new ArrayList<>();
        for (Map.Entry<OffsetDateTime, Map<String, String>> entry : values.entrySet()) {
            Map<String, String> point = entry.getValue();
            points.add(new WeatherForecastSelector.ForecastPoint(
                issuedAt, entry.getKey(), decimal(point.get("TMP")), integer(point.get("POP")), integer(point.get("PTY")), point.get("SKY")
            ));
        }
        return points;
    }

    private Double decimal(String value) { try { return value == null ? null : Double.valueOf(value); } catch (NumberFormatException ignored) { return null; } }
    private Integer integer(String value) { try { return value == null ? null : Integer.valueOf(value); } catch (NumberFormatException ignored) { return null; } }

    static class WeatherProviderException extends RuntimeException {
        WeatherProviderException(String message) { super(message); }
        WeatherProviderException(String message, Throwable cause) { super(message, cause); }
    }
}
