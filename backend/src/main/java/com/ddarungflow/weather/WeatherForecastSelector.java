package com.ddarungflow.weather;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class WeatherForecastSelector {

    public record RawForecastData(
        String stationId,
        OffsetDateTime announcedAt,
        OffsetDateTime fetchedAt,
        boolean fetchFailed,
        List<HourlyItem> items
    ) {
        public record HourlyItem(
            OffsetDateTime forecastAt,
            Double temperature,
            Integer pop,
            Integer pty,
            String skyStatus
        ) {}
    }

    /**
     * 도착 예정시간에 사용할 한 건을 고르고 결과 상태를 결정합니다.
     *
     * @param stationId     대여소 ID
     * @param arrivalAt     도착 예정 시각
     * @param forecastBatches 예보 데이터 배치 목록 (최신순 또는 임의순)
     * @return WeatherForecastResult 선택 결과
     */
    public WeatherForecastResult select(String stationId, OffsetDateTime arrivalAt, List<RawForecastData> forecastBatches) {
        if (arrivalAt == null) {
            throw new IllegalArgumentException("arrivalAt은 null일 수 없습니다.");
        }

        // 도착 시각을 30분 기준으로 가까운 정시에 맞춤 (예: 16:30 -> 17:00, 16:29 -> 16:00)
        OffsetDateTime roundedTargetAt = arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS);

        if (forecastBatches == null || forecastBatches.isEmpty()) {
            return createUnavailableResult(stationId, arrivalAt, roundedTargetAt);
        }

        // 발표/수집시각 기준 최신순 정렬
        List<RawForecastData> sortedBatches = forecastBatches.stream()
            .sorted(Comparator.comparing(RawForecastData::announcedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(RawForecastData::fetchedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();

        RawForecastData latestBatch = sortedBatches.get(0);

        // 최신 호출 성공 여부 체크
        if (!latestBatch.fetchFailed()) {
            Optional<RawForecastData.HourlyItem> targetItemOpt = findTargetItem(latestBatch, roundedTargetAt);
            if (targetItemOpt.isPresent()) {
                RawForecastData.HourlyItem item = targetItemOpt.get();
                if (isComplete(item)) {
                    return createResult(stationId, arrivalAt, roundedTargetAt, latestBatch, item, WeatherStatus.NORMAL);
                } else {
                    return createMissingResult(stationId, arrivalAt, roundedTargetAt, latestBatch, item);
                }
            } else {
                // target time item missing in latest batch
                return createMissingResult(stationId, arrivalAt, roundedTargetAt, latestBatch, null);
            }
        }

        // 최신 호출 실패 시: 직전 완전값(호출 성공 + 필수 값 완전) 탐색
        for (int i = 1; i < sortedBatches.size(); i++) {
            RawForecastData fallbackBatch = sortedBatches.get(i);
            if (!fallbackBatch.fetchFailed()) {
                Optional<RawForecastData.HourlyItem> fallbackItemOpt = findTargetItem(fallbackBatch, roundedTargetAt);
                if (fallbackItemOpt.isPresent() && isComplete(fallbackItemOpt.get())) {
                    return createResult(stationId, arrivalAt, roundedTargetAt, fallbackBatch, fallbackItemOpt.get(), WeatherStatus.DELAYED);
                }
            }
        }

        // 대체값도 없으면 UNAVAILABLE
        return createUnavailableResult(stationId, arrivalAt, roundedTargetAt);
    }

    private Optional<RawForecastData.HourlyItem> findTargetItem(RawForecastData batch, OffsetDateTime targetAt) {
        if (batch.items() == null) return Optional.empty();
        return batch.items().stream()
            .filter(item -> item.forecastAt() != null && item.forecastAt().isEqual(targetAt))
            .findFirst();
    }

    private boolean isComplete(RawForecastData.HourlyItem item) {
        return item != null
            && item.temperature() != null
            && item.pop() != null
            && item.pty() != null;
    }

    private boolean checkIsRainy(Integer pop, Integer pty) {
        boolean highPop = pop != null && pop >= 50;
        boolean rainyPty = pty != null && (pty == 1 || pty == 2 || pty == 4); // 1: 비, 2: 비/눈, 4: 소나기
        return highPop || rainyPty;
    }

    private List<WeatherForecastResult.HourlyForecast> mapHourlyList(RawForecastData batch) {
        if (batch == null || batch.items() == null) {
            return Collections.emptyList();
        }
        return batch.items().stream()
            .sorted(Comparator.comparing(RawForecastData.HourlyItem::forecastAt, Comparator.nullsLast(Comparator.naturalOrder())))
            .map(i -> new WeatherForecastResult.HourlyForecast(
                i.forecastAt(),
                i.temperature(),
                i.pop(),
                i.pty(),
                i.skyStatus()
            ))
            .toList();
    }

    private WeatherForecastResult createResult(
        String stationId,
        OffsetDateTime arrivalAt,
        OffsetDateTime targetAt,
        RawForecastData batch,
        RawForecastData.HourlyItem item,
        WeatherStatus status
    ) {
        boolean isRainy = checkIsRainy(item.pop(), item.pty());
        return new WeatherForecastResult(
            stationId != null ? stationId : batch.stationId(),
            arrivalAt,
            targetAt,
            batch.announcedAt(),
            batch.fetchedAt(),
            item.temperature(),
            item.pop(),
            item.pty(),
            item.skyStatus(),
            isRainy,
            mapHourlyList(batch),
            status
        );
    }

    private WeatherForecastResult createMissingResult(
        String stationId,
        OffsetDateTime arrivalAt,
        OffsetDateTime targetAt,
        RawForecastData batch,
        RawForecastData.HourlyItem item
    ) {
        return new WeatherForecastResult(
            stationId != null ? stationId : batch.stationId(),
            arrivalAt,
            targetAt,
            batch.announcedAt(),
            batch.fetchedAt(),
            item != null ? item.temperature() : null,
            item != null ? item.pop() : null,
            item != null ? item.pty() : null,
            item != null ? item.skyStatus() : null,
            false,
            mapHourlyList(batch),
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
