package com.ddarungflow.airquality;

public enum AirQualityGrade {
    GOOD("1"),
    MODERATE("2"),
    BAD("3"),
    VERY_BAD("4");

    private final String rawCode;

    AirQualityGrade(String rawCode) {
        this.rawCode = rawCode;
    }

    public String getRawCode() {
        return rawCode;
    }

    public static AirQualityGrade fromCode(String code) {
        if (code == null) {
            return null;
        }
        return switch (code.trim()) {
            case "1" -> GOOD;
            case "2" -> MODERATE;
            case "3" -> BAD;
            case "4" -> VERY_BAD;
            default -> null;
        };
    }
}
