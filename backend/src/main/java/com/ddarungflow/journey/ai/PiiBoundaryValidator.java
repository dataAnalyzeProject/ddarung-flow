package com.ddarungflow.journey.ai;

import java.util.regex.Pattern;

public class PiiBoundaryValidator {
    private static final Pattern EMAIL = Pattern.compile("(?i)\\b[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}\\b");
    private static final Pattern PHONE = Pattern.compile("\\b01[016789]-?\\d{3,4}-?\\d{4}\\b");
    private static final Pattern COORDINATE = Pattern.compile("\\b(?:[0-8]?\\d(?:\\.\\d+)?|90(?:\\.0+)?),\\s*(?:1[0-7]\\d(?:\\.\\d+)?|180(?:\\.0+)?|\\d{1,2}(?:\\.\\d+)?)\\b");

    public void rejectSensitiveInput(String input) {
        String value = input == null ? "" : input;
        if (EMAIL.matcher(value).find() || PHONE.matcher(value).find() || COORDINATE.matcher(value).find() || value.contains("집") || value.contains("회사")) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_PII_BLOCKED, "sensitive input must be resolved before provider use");
        }
    }
}
