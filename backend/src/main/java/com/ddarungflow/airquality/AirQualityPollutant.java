package com.ddarungflow.airquality;

public record AirQualityPollutant(
    Double value,
    String unit,
    AirQualityGrade grade,
    String sourceGradeCode
) {
}
