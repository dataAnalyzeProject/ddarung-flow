package com.ddarungflow.airquality;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class AirQualitySelector {

    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private final ObjectMapper objectMapper;

    public AirQualitySelector() {
        this.objectMapper = new ObjectMapper();
    }

    public AirQualitySelector(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public AirQualityResult selectFromJson(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            String latestJsonFixture,
            String previousJsonFixture,
            boolean latestFetchFailed
    ) {
        List<AirKoreaMeasurementPoint> latestPoints = parseJsonFixture(latestJsonFixture);
        List<AirKoreaMeasurementPoint> previousPoints = parseJsonFixture(previousJsonFixture);

        return select(stationName, targetTime, collectedAt, latestPoints, previousPoints, latestFetchFailed);
    }

    public AirQualityResult select(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            List<AirKoreaMeasurementPoint> latest,
            List<AirKoreaMeasurementPoint> previous,
            boolean latestFetchFailed
    ) {
        validateInputs(stationName, targetTime, collectedAt);

        List<AirKoreaMeasurementPoint> safeLatest = Optional.ofNullable(latest).orElse(Collections.emptyList());
        List<AirKoreaMeasurementPoint> safePrevious = Optional.ofNullable(previous).orElse(Collections.emptyList());

        if (latestFetchFailed) {
            Optional<AirKoreaMeasurementPoint> validPrevPoint = findValidPoint(safePrevious, stationName);
            if (validPrevPoint.isPresent()) {
                AirKoreaMeasurementPoint point = validPrevPoint.get();
                return createResult(stationName, point, AirQualityStatus.DELAYED, safePrevious);
            }
            if (!safeLatest.isEmpty() || !safePrevious.isEmpty()) {
                return createEmptyResult(stationName, AirQualityStatus.MISSING, safePrevious);
            }
            return createEmptyResult(stationName, AirQualityStatus.UNAVAILABLE, safePrevious);
        }

        Optional<AirKoreaMeasurementPoint> validLatestPoint = findValidPoint(safeLatest, stationName);
        if (validLatestPoint.isPresent()) {
            AirKoreaMeasurementPoint point = validLatestPoint.get();
            return createResult(stationName, point, AirQualityStatus.NORMAL, safeLatest);
        }

        if (safeLatest.isEmpty() && safePrevious.isEmpty()) {
            return createEmptyResult(stationName, AirQualityStatus.UNAVAILABLE, Collections.emptyList());
        }

        // 최신 수집 데이터는 있으나 지정 stationName이 없거나 필수 필드가 비어있는 경우 MISSING
        return createEmptyResult(stationName, AirQualityStatus.MISSING, safeLatest);
    }

    public List<AirKoreaMeasurementPoint> parseJsonFixture(String jsonFixture) {
        if (jsonFixture == null || jsonFixture.isBlank()) {
            return Collections.emptyList();
        }

        List<AirKoreaMeasurementPoint> points = new ArrayList<>();
        try {
            JsonNode rootNode = objectMapper.readTree(jsonFixture);
            JsonNode itemsNode = null;

            if (rootNode.has("response") && rootNode.get("response").has("body")) {
                JsonNode body = rootNode.get("response").get("body");
                if (body.has("items")) {
                    itemsNode = body.get("items");
                }
            } else if (rootNode.has("items")) {
                itemsNode = rootNode.get("items");
            } else if (rootNode.isArray()) {
                itemsNode = rootNode;
            }

            if (itemsNode != null && itemsNode.isArray()) {
                for (JsonNode item : itemsNode) {
                    points.add(parseItemNode(item));
                }
            }
        } catch (Exception e) {
            // Json 파싱 오류 시 빈 리스트 반환
            return Collections.emptyList();
        }
        return points;
    }

    private AirKoreaMeasurementPoint parseItemNode(JsonNode item) {
        String stationName = item.path("stationName").asText(null);
        String dataTimeStr = item.path("dataTime").asText(null);
        OffsetDateTime dataTime = null;
        if (dataTimeStr != null && !dataTimeStr.isBlank()) {
            try {
                LocalDateTime ldt = LocalDateTime.parse(dataTimeStr.trim(), DATE_TIME_FORMATTER);
                dataTime = ldt.atOffset(KST_OFFSET);
            } catch (Exception ignored) {
            }
        }

        Integer pm10Value = parseInteger(item.path("pm10Value"));
        Integer pm25Value = parseInteger(item.path("pm25Value"));
        Double o3Value = parseDouble(item.path("o3Value"));
        String pm10Grade = parseString(item.path("pm10Grade"));
        String pm25Grade = parseString(item.path("pm25Grade"));
        String khaiGrade = parseString(item.path("khaiGrade"));

        return new AirKoreaMeasurementPoint(
                stationName,
                dataTime,
                pm10Value,
                pm25Value,
                o3Value,
                pm10Grade,
                pm25Grade,
                khaiGrade
        );
    }

    private Integer parseInteger(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText();
        if (text == null || text.isBlank() || "-".equals(text.trim())) {
            return null;
        }
        try {
            return Integer.parseInt(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double parseDouble(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText();
        if (text == null || text.isBlank() || "-".equals(text.trim())) {
            return null;
        }
        try {
            return Double.parseDouble(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseString(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText().trim();
        return text.isBlank() || "-".equals(text) ? null : text;
    }

    private Optional<AirKoreaMeasurementPoint> findValidPoint(List<AirKoreaMeasurementPoint> points, String stationName) {
        return points.stream()
                .filter(p -> Objects.equals(p.stationName(), stationName))
                .filter(this::isValidMeasurementPoint)
                .findFirst();
    }

    private boolean isValidMeasurementPoint(AirKoreaMeasurementPoint point) {
        return point.stationName() != null && !point.stationName().isBlank()
                && point.dataTime() != null
                && (point.pm10Value() != null || point.pm25Value() != null)
                && (point.pm10Grade() != null || point.pm25Grade() != null || point.khaiGrade() != null);
    }

    private AirQualityResult createResult(
            String stationName,
            AirKoreaMeasurementPoint point,
            AirQualityStatus status,
            List<AirKoreaMeasurementPoint> recent
    ) {
        return new AirQualityResult(
                stationName,
                point.dataTime(),
                point.pm10Value(),
                point.pm25Value(),
                point.o3Value(),
                point.pm10Grade(),
                point.pm25Grade(),
                point.khaiGrade(),
                status,
                recent
        );
    }

    private AirQualityResult createEmptyResult(
            String stationName,
            AirQualityStatus status,
            List<AirKoreaMeasurementPoint> recent
    ) {
        return new AirQualityResult(
                stationName,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                status,
                recent
        );
    }

    private void validateInputs(String stationName, OffsetDateTime targetTime, OffsetDateTime collectedAt) {
        if (stationName == null || stationName.isBlank()) {
            throw new IllegalArgumentException("stationName must not be null or blank");
        }
        if (targetTime == null) {
            throw new IllegalArgumentException("targetTime must not be null");
        }
        if (!targetTime.getOffset().equals(KST_OFFSET)) {
            throw new IllegalArgumentException("targetTime offset must be +09:00");
        }
        if (collectedAt != null && !collectedAt.getOffset().equals(KST_OFFSET)) {
            throw new IllegalArgumentException("collectedAt offset must be +09:00");
        }
    }
}
