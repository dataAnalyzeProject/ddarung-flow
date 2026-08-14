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

        // 1. 최신 수집 실패 혹은 소스 사용 불가 상태인 경우
        if (latestFetchFailed) {
            return processDelayedOrUnavailable(stationName, targetTime, safePrevious);
        }

        // 2. 최신 수집 데이터에서 대상 측정소 데이터 검색
        Optional<AirKoreaMeasurementPoint> latestPointOpt = findPointByStation(safeLatest, stationName);

        if (latestPointOpt.isPresent()) {
            AirKoreaMeasurementPoint point = latestPointOpt.get();

            // 세 오염물질(pm10Value, pm25Value, o3Value)이 모두 null 이면 MISSING
            if (isAllPollutantsMissing(point)) {
                return createResult(stationName, point, AirQualityStatus.MISSING, safeLatest);
            }

            // dataTime 시간 경계 판정 (2시간 / 6시간)
            long minutesDiff = calculateAgeInMinutes(targetTime, point.dataTime());
            if (minutesDiff < 0 || minutesDiff > 360) {
                // 6시간 초과된 데이터는 UNAVAILABLE
                return createResult(stationName, point, AirQualityStatus.UNAVAILABLE, safeLatest);
            } else if (minutesDiff > 120) {
                // 2시간 초과 6시간 이내는 DELAYED
                return createResult(stationName, point, AirQualityStatus.DELAYED, safeLatest);
            } else {
                // 2시간 이내는 NORMAL
                return createResult(stationName, point, AirQualityStatus.NORMAL, safeLatest);
            }
        }

        // 최신 데이터에 없다면 직전 성공 수집 데이터에서 대체 가능한지 확인
        return processDelayedOrUnavailable(stationName, targetTime, safePrevious);
    }

    private AirQualityResult processDelayedOrUnavailable(
            String stationName,
            OffsetDateTime targetTime,
            List<AirKoreaMeasurementPoint> previous
    ) {
        Optional<AirKoreaMeasurementPoint> prevPointOpt = findPointByStation(previous, stationName);
        if (prevPointOpt.isPresent()) {
            AirKoreaMeasurementPoint point = prevPointOpt.get();
            if (isAllPollutantsMissing(point)) {
                return createResult(stationName, point, AirQualityStatus.MISSING, previous);
            }

            long minutesDiff = calculateAgeInMinutes(targetTime, point.dataTime());
            if (minutesDiff >= 0 && minutesDiff <= 360) {
                // 직전 데이터가 6시간 이내이면 DELAYED
                return createResult(stationName, point, AirQualityStatus.DELAYED, previous);
            }
        }

        if (previous.isEmpty() && prevPointOpt.isEmpty()) {
            return createEmptyResult(stationName, AirQualityStatus.UNAVAILABLE, previous);
        }

        return createEmptyResult(stationName, AirQualityStatus.UNAVAILABLE, previous);
    }

    public List<AirKoreaMeasurementPoint> parseJsonFixture(String jsonFixture) {
        if (jsonFixture == null || jsonFixture.isBlank()) {
            return Collections.emptyList();
        }

        List<AirKoreaMeasurementPoint> points = new ArrayList<>();
        try {
            JsonNode rootNode = objectMapper.readTree(jsonFixture);

            // header resultCode가 00이 아니면 소스 사용 불가능(빈 리스트 반환)
            if (rootNode.has("response") && rootNode.get("response").has("header")) {
                JsonNode header = rootNode.get("response").get("header");
                String resultCode = header.path("resultCode").asText("");
                if (!"00".equals(resultCode)) {
                    return Collections.emptyList();
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
            return Collections.emptyList();
        }
        return points;
    }

    private AirKoreaMeasurementPoint parseItemNode(JsonNode item) {
        String stationName = parseString(item.path("stationName"));
        String dataTimeStr = parseString(item.path("dataTime"));
        OffsetDateTime dataTime = parseOffsetDateTime(dataTimeStr);

        Integer pm10Value = parseInteger(item.path("pm10Value"));
        Integer pm25Value = parseInteger(item.path("pm25Value"));
        Double o3Value = parseDouble(item.path("o3Value"));
        Integer khaiValue = parseInteger(item.path("khaiValue"));

        String pm10GradeCode = parseString(item.path("pm10Grade"));
        String pm25GradeCode = parseString(item.path("pm25Grade"));
        String khaiGradeCode = parseString(item.path("khaiGrade"));

        AirQualityGrade pm10Grade = AirQualityGrade.fromCode(pm10GradeCode);
        AirQualityGrade pm25Grade = AirQualityGrade.fromCode(pm25GradeCode);
        AirQualityGrade khaiGrade = AirQualityGrade.fromCode(khaiGradeCode);

        return new AirKoreaMeasurementPoint(
                stationName,
                dataTime,
                pm10Value,
                pm25Value,
                o3Value,
                khaiValue,
                pm10GradeCode,
                pm25GradeCode,
                khaiGradeCode,
                pm10Grade,
                pm25Grade,
                khaiGrade
        );
    }

    private String parseString(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText().trim();
        if (text.isBlank() || "-".equals(text) || "null".equalsIgnoreCase(text)) {
            return null;
        }
        return text;
    }

    private Integer parseInteger(JsonNode node) {
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

    private Double parseDouble(JsonNode node) {
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

    private OffsetDateTime parseOffsetDateTime(String dataTimeStr) {
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

    private Optional<AirKoreaMeasurementPoint> findPointByStation(List<AirKoreaMeasurementPoint> points, String stationName) {
        return points.stream()
                .filter(p -> Objects.equals(p.stationName(), stationName))
                .findFirst();
    }

    private boolean isAllPollutantsMissing(AirKoreaMeasurementPoint point) {
        return point.pm10Value() == null && point.pm25Value() == null && point.o3Value() == null;
    }

    private long calculateAgeInMinutes(OffsetDateTime targetTime, OffsetDateTime dataTime) {
        if (dataTime == null || targetTime == null) {
            return 999999;
        }
        return Duration.between(dataTime, targetTime).toMinutes();
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
                point.khaiValue(),
                point.pm10GradeCode(),
                point.pm25GradeCode(),
                point.khaiGradeCode(),
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
