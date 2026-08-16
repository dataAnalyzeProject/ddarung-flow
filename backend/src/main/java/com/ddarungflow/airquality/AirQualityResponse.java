package com.ddarungflow.airquality;

import java.time.OffsetDateTime;

public record AirQualityResponse(
        String stationId,
        String status,
        String message,
        MeasurementStationDto measurementStation,
        OffsetDateTime measuredAt,
        OffsetDateTime collectedAt,
        KhaiDto khai,
        PollutantDto pm10,
        PollutantDto pm25,
        PollutantDto o3
) {

    public record MeasurementStationDto(String name, Integer distanceMeters) {
    }

    public record KhaiDto(Double value, String grade, String sourceGradeCode) {
    }

    public record PollutantDto(Double value, String unit, String grade, String sourceGradeCode) {
    }

    public static AirQualityResponse from(
            String stationId,
            AirQualityService.NearestMeasurementStation nearest,
            OffsetDateTime collectedAt,
            AirQualityResult result
    ) {
        return new AirQualityResponse(
                stationId,
                result.status().name(),
                null,
                new MeasurementStationDto(nearest.stationName(), nearest.distanceMeters()),
                result.dataTime(),
                collectedAt,
                toKhaiDto(result.khai()),
                toPollutantDto(result.pm10()),
                toPollutantDto(result.pm25()),
                toPollutantDto(result.o3())
        );
    }

    public static AirQualityResponse unavailable(
            String stationId,
            MeasurementStationDto measurementStation,
            OffsetDateTime measuredAt,
            OffsetDateTime collectedAt
    ) {
        return new AirQualityResponse(
                stationId,
                AirQualityStatus.UNAVAILABLE.name(),
                null,
                measurementStation,
                measuredAt,
                collectedAt,
                new KhaiDto(null, null, null),
                new PollutantDto(null, "µg/m³", null, null),
                new PollutantDto(null, "µg/m³", null, null),
                new PollutantDto(null, "ppm", null, null)
        );
    }

    private static KhaiDto toKhaiDto(AirQualityPollutant pollutant) {
        return new KhaiDto(pollutant.value(), gradeName(pollutant.grade()), pollutant.sourceGradeCode());
    }

    private static PollutantDto toPollutantDto(AirQualityPollutant pollutant) {
        return new PollutantDto(pollutant.value(), pollutant.unit(), gradeName(pollutant.grade()), pollutant.sourceGradeCode());
    }

    private static String gradeName(AirQualityGrade grade) {
        return grade != null ? grade.name() : null;
    }
}
