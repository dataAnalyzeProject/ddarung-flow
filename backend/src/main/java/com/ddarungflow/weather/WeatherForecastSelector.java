package com.ddarungflow.weather;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class WeatherForecastSelector {

    public record ForecastPoint(
        OffsetDateTime issuedAt,
        OffsetDateTime forecastAt,
        Double temperatureC,
        Integer precipitationProbabilityPercent,
        Integer ptyCode,
        String skyCode
    ) {}

    /**
     * 도착 예정시간에 사용할 한 건을 고르고 결과 상태를 결정합니다.
     *
     * @param stationId          대여소 ID
     * @param arrivalAt          도착 예정 시각
     * @param nx                 격자 X 좌표
     * @param ny                 격자 Y 좌표
     * @param collectedAt        수집 시각
     * @param latest             최신 예보 목록
     * @param previous           직전 예보 목록
     * @param latestFetchFailed 최신 호출 실패 여부
     * @return WeatherForecastResult 선택 결과
     */
    public WeatherForecastResult select(
        String stationId,
        OffsetDateTime arrivalAt,
        int nx,
        int ny,
        OffsetDateTime collectedAt,
        List<ForecastPoint> latest,
        List<ForecastPoint> previous,
        boolean latestFetchFailed
    ) {
        if (arrivalAt == null) {
            throw new IllegalArgumentException("arrivalAt은 null일 수 없습니다.");
        }

        // 도착 시각을 30분 기준으로 가까운 정시에 맞춤 (예: 16:30 -> 17:00, 16:29 -> 16:00)
        OffsetDateTime roundedTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        // 1. 최신 예보 호출 성공 시 검사
        if (!latestFetchFailed && latest != null && !latest.isEmpty()) {
            Optional<ForecastPoint> targetPointOpt = findTargetPoint(latest, roundedTargetAt);
            if (targetPointOpt.isPresent()) {
                ForecastPoint point = targetPointOpt.get();
                if (isComplete(point)) {
                    return createResult(stationId, arrivalAt, roundedTargetAt, collectedAt, point, latest, WeatherStatus.NORMAL);
                } else {
                    return createMissingResult(stationId, arrivalAt, roundedTargetAt, collectedAt, point, latest);
                }
            } else {
                return createMissingResult(stationId, arrivalAt, roundedTargetAt, collectedAt, null, latest);
            }
        }

        // 2. 최신 호출 실패 시: 직전 완전값 사용
        if (previous != null && !previous.isEmpty()) {
            Optional<ForecastPoint> fallbackPointOpt = findTargetPoint(previous, roundedTargetAt);
            if (fallbackPointOpt.isPresent() && isComplete(fallbackPointOpt.get())) {
                return createResult(stationId, arrivalAt, roundedTargetAt, collectedAt, fallbackPointOpt.get(), previous, WeatherStatus.DELAYED);
            }
        }

        // 3. 대체값도 없거나 모든 예보가 없는 경우 UNAVAILABLE 반환
        return createUnavailableResult(stationId, arrivalAt, roundedTargetAt);
    }

    private Optional<ForecastPoint> findTargetPoint(List<ForecastPoint> points, OffsetDateTime targetAt) {
        if (points == null) return Optional.empty();
        return points.stream()
            .filter(p -> p.forecastAt() != null && p.forecastAt().isEqual(targetAt))
            .findFirst();
    }

    private boolean isComplete(ForecastPoint point) {
        return point != null
            && point.temperatureC() != null
            && point.precipitationProbabilityPercent() != null
            && point.ptyCode() != null
            && point.skyCode() != null;
    }

    private boolean checkIsRainy(Integer pop, Integer pty) {
        boolean highPop = pop != null && pop >= 50;
        boolean rainyPty = pty != null && (pty == 1 || pty == 2 || pty == 3 || pty == 4); // 1: 비, 2: 비/눈, 3: 눈, 4: 소나기
        return highPop || rainyPty;
    }

    private List<WeatherForecastResult.HourlyForecast> mapHourlyList(List<ForecastPoint> points) {
        if (points == null) {
            return Collections.emptyList();
        }
        return points.stream()
            .sorted(Comparator.comparing(ForecastPoint::forecastAt, Comparator.nullsLast(Comparator.naturalOrder())))
            .map(p -> new WeatherForecastResult.HourlyForecast(
                p.forecastAt(),
                p.temperatureC(),
                p.precipitationProbabilityPercent(),
                p.ptyCode(),
                p.skyCode()
            ))
            .toList();
    }

    private WeatherForecastResult createResult(
        String stationId,
        OffsetDateTime arrivalAt,
        OffsetDateTime targetAt,
        OffsetDateTime collectedAt,
        ForecastPoint point,
        List<ForecastPoint> list,
        WeatherStatus status
    ) {
        boolean isRainy = checkIsRainy(point.precipitationProbabilityPercent(), point.ptyCode());
        return new WeatherForecastResult(
            stationId,
            arrivalAt,
            targetAt,
            point.issuedAt(),
            collectedAt,
            point.temperatureC(),
            point.precipitationProbabilityPercent(),
            point.ptyCode(),
            point.skyCode(),
            isRainy,
            mapHourlyList(list),
            status
        );
    }

    private WeatherForecastResult createMissingResult(
        String stationId,
        OffsetDateTime arrivalAt,
        OffsetDateTime targetAt,
        OffsetDateTime collectedAt,
        ForecastPoint point,
        List<ForecastPoint> list
    ) {
        return new WeatherForecastResult(
            stationId,
            arrivalAt,
            targetAt,
            point != null ? point.issuedAt() : null,
            collectedAt,
            point != null ? point.temperatureC() : null,
            point != null ? point.precipitationProbabilityPercent() : null,
            point != null ? point.ptyCode() : null,
            point != null ? point.skyCode() : null,
            false,
            mapHourlyList(list),
            WeatherStatus.MISSING
        );
    }

    private WeatherForecastResult createUnavailableResult(
        String stationId,
        OffsetDateTime arrivalAt,
        OffsetDateTime targetAt
    ) {
        return new WeatherForecastResult(
            stationId,
            arrivalAt,
            targetAt,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            Collections.emptyList(),
            WeatherStatus.UNAVAILABLE
        );
    }
}
