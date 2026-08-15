package com.ddarungflow.airquality;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class AirQualityMapper {

    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static final String UNIT_PM10 = "µg/m³";
    public static final String UNIT_PM25 = "µg/m³";
    public static final String UNIT_O3 = "ppm";
    public static final String UNIT_KHAI = "index";

    private AirQualityMapper() {
    }

    private record RawMeasurementPoint(
            String stationName,
            OffsetDateTime dataTime,
            Integer pm10Value,
            Integer pm25Value,
            Double o3Value,
            Integer khaiValue,
            String pm10GradeCode,
            String pm25GradeCode,
            String o3GradeCode,
            String khaiGradeCode,
            AirQualityGrade pm10Grade,
            AirQualityGrade pm25Grade,
            AirQualityGrade o3Grade,
            AirQualityGrade khaiGrade
    ) {
    }

    private record ParsedFixture(List<RawMeasurementPoint> points, boolean sourceFailed) {
    }

    public static AirQualityResult mapFromJson(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            String latestJsonFixture,
            String previousJsonFixture,
            boolean latestFetchFailed
    ) {
        ParsedFixture latestParsed = parseJsonFixtureInternal(latestJsonFixture);
        ParsedFixture previousParsed = parseJsonFixtureInternal(previousJsonFixture);

        boolean sourceUnavailable = latestFetchFailed || latestParsed.sourceFailed();

        return mapInternal(stationName, targetTime, collectedAt, latestParsed.points(), previousParsed.points(), sourceUnavailable);
    }

    private static AirQualityResult mapInternal(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            List<RawMeasurementPoint> latest,
            List<RawMeasurementPoint> previous,
            boolean sourceUnavailable
    ) {
        validateInputs(stationName, targetTime, collectedAt);

        List<RawMeasurementPoint> safeLatest = Optional.ofNullable(latest).orElse(Collections.emptyList());
        List<RawMeasurementPoint> safePrevious = Optional.ofNullable(previous).orElse(Collections.emptyList());

        if (sourceUnavailable) {
            return buildEmptyResult(stationName, AirQualityStatus.UNAVAILABLE);
        }

        Optional<RawMeasurementPoint> latestPointOpt = findPointByStation(safeLatest, stationName);

        if (latestPointOpt.isPresent()) {
            RawMeasurementPoint point = latestPointOpt.get();

            if (isAllPollutantsMissing(point)) {
                return buildResult(stationName, point, AirQualityStatus.MISSING);
            }

            long minutesDiff = calculateAgeInMinutes(targetTime, point.dataTime());
            if (minutesDiff < 0 || minutesDiff > 360) {
                return buildResult(stationName, point, AirQualityStatus.UNAVAILABLE);
            } else if (minutesDiff > 120) {
                return buildResult(stationName, point, AirQualityStatus.DELAYED);
            } else {
                return buildResult(stationName, point, AirQualityStatus.NORMAL);
            }
        }

        return processDelayedOrUnavailable(stationName, targetTime, safePrevious);
    }

    private static AirQualityResult processDelayedOrUnavailable(
            String stationName,
            OffsetDateTime targetTime,
            List<RawMeasurementPoint> previous
    ) {
        Optional<RawMeasurementPoint> prevPointOpt = findPointByStation(previous, stationName);
        if (prevPointOpt.isPresent()) {
            RawMeasurementPoint point = prevPointOpt.get();
            if (isAllPollutantsMissing(point)) {
                return buildResult(stationName, point, AirQualityStatus.MISSING);
            }

            long minutesDiff = calculateAgeInMinutes(targetTime, point.dataTime());
            if (minutesDiff >= 0 && minutesDiff <= 360) {
                return buildResult(stationName, point, AirQualityStatus.DELAYED);
            }
        }

        return buildEmptyResult(stationName, AirQualityStatus.UNAVAILABLE);
    }

    private static ParsedFixture parseJsonFixtureInternal(String jsonFixture) {
        if (jsonFixture == null || jsonFixture.isBlank()) {
            return new ParsedFixture(Collections.emptyList(), false);
        }

        List<RawMeasurementPoint> points = new ArrayList<>();
        try {
            JsonNode rootNode = OBJECT_MAPPER.readTree(jsonFixture);

            if (rootNode.has("response") && rootNode.get("response").has("header")) {
                JsonNode header = rootNode.get("response").get("header");
                String resultCode = header.path("resultCode").asText("");
                if (!"00".equals(resultCode)) {
                    return new ParsedFixture(Collections.emptyList(), true);
                }
            }

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
            return new ParsedFixture(Collections.emptyList(), false);
        }
        return new ParsedFixture(points, false);
    }

    private static RawMeasurementPoint parseItemNode(JsonNode item) {
        String stationName = parseString(item.path("stationName"));
        String dataTimeStr = parseString(item.path("dataTime"));
        OffsetDateTime dataTime = parseOffsetDateTime(dataTimeStr);

        Integer pm10Value = parseInteger(item.path("pm10Value"));
        Integer pm25Value = parseInteger(item.path("pm25Value"));
        Double o3Value = parseDouble(item.path("o3Value"));
        Integer khaiValue = parseInteger(item.path("khaiValue"));

        String pm10GradeCode = parseString(item.path("pm10Grade"));
        String pm25GradeCode = parseString(item.path("pm25Grade"));
        String o3GradeCode = parseString(item.path("o3Grade"));
        String khaiGradeCode = parseString(item.path("khaiGrade"));

        AirQualityGrade pm10Grade = AirQualityGrade.fromCode(pm10GradeCode);
        AirQualityGrade pm25Grade = AirQualityGrade.fromCode(pm25GradeCode);
        AirQualityGrade o3Grade = AirQualityGrade.fromCode(o3GradeCode);
        AirQualityGrade khaiGrade = AirQualityGrade.fromCode(khaiGradeCode);

        return new RawMeasurementPoint(
                stationName,
                dataTime,
                pm10Value,
                pm25Value,
                o3Value,
                khaiValue,
                pm10GradeCode,
                pm25GradeCode,
                o3GradeCode,
                khaiGradeCode,
                pm10Grade,
                pm25Grade,
                o3Grade,
                khaiGrade
        );
    }

    private static String parseString(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText().trim();
        if (text.isBlank() || "-".equals(text) || "null".equalsIgnoreCase(text)) {
            return null;
        }
        return text;
    }

    private static Integer parseInteger(JsonNode node) {
        String str = parseString(node);
        if (str == null) {
            return null;
        }
        try {
            return Integer.parseInt(str);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Double parseDouble(JsonNode node) {
        String str = parseString(node);
        if (str == null) {
            return null;
        }
        try {
            return Double.parseDouble(str);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static OffsetDateTime parseOffsetDateTime(String dataTimeStr) {
        if (dataTimeStr == null || dataTimeStr.isBlank()) {
            return null;
        }
        try {
            LocalDateTime ldt = LocalDateTime.parse(dataTimeStr.trim(), DATE_TIME_FORMATTER);
            return ldt.atOffset(KST_OFFSET);
        } catch (Exception e) {
            return null;
        }
    }

    private static Optional<RawMeasurementPoint> findPointByStation(List<RawMeasurementPoint> points, String stationName) {
        return points.stream()
                .filter(p -> Objects.equals(p.stationName(), stationName))
                .findFirst();
    }

    private static boolean isAllPollutantsMissing(RawMeasurementPoint point) {
        return point.pm10Value() == null && point.pm25Value() == null && point.o3Value() == null;
    }

    private static long calculateAgeInMinutes(OffsetDateTime targetTime, OffsetDateTime dataTime) {
        if (dataTime == null || targetTime == null) {
            return 999999;
        }
        return Duration.between(dataTime, targetTime).toMinutes();
    }

    private static AirQualityResult buildResult(String stationName, RawMeasurementPoint point, AirQualityStatus status) {
        AirQualityPollutant pm10 = new AirQualityPollutant(
                point.pm10Value() != null ? point.pm10Value().doubleValue() : null,
                UNIT_PM10,
                point.pm10Grade(),
                point.pm10GradeCode()
        );

        AirQualityPollutant pm25 = new AirQualityPollutant(
                point.pm25Value() != null ? point.pm25Value().doubleValue() : null,
                UNIT_PM25,
                point.pm25Grade(),
                point.pm25GradeCode()
        );

        AirQualityPollutant o3 = new AirQualityPollutant(
                point.o3Value(),
                UNIT_O3,
                point.o3Grade(),
                point.o3GradeCode()
        );

        AirQualityPollutant khai = new AirQualityPollutant(
                point.khaiValue() != null ? point.khaiValue().doubleValue() : null,
                UNIT_KHAI,
                point.khaiGrade(),
                point.khaiGradeCode()
        );

        return new AirQualityResult(
                stationName,
                point.dataTime(),
                pm10,
                pm25,
                o3,
                khai,
                status
        );
    }

    private static AirQualityResult buildEmptyResult(String stationName, AirQualityStatus status) {
        AirQualityPollutant pm10 = new AirQualityPollutant(null, UNIT_PM10, null, null);
        AirQualityPollutant pm25 = new AirQualityPollutant(null, UNIT_PM25, null, null);
        AirQualityPollutant o3 = new AirQualityPollutant(null, UNIT_O3, null, null);
        AirQualityPollutant khai = new AirQualityPollutant(null, UNIT_KHAI, null, null);

        return new AirQualityResult(
                stationName,
                null,
                pm10,
                pm25,
                o3,
                khai,
                status
        );
    }

    private static void validateInputs(String stationName, OffsetDateTime targetTime, OffsetDateTime collectedAt) {
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
