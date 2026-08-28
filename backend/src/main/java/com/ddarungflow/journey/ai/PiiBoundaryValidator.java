package com.ddarungflow.journey.ai;

import java.util.regex.Pattern;

public class PiiBoundaryValidator {
    private static final Pattern EMAIL = Pattern.compile("(?i)\\b[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}\\b");
    private static final Pattern PHONE = Pattern.compile("\\b01[016789]-?\\d{3,4}-?\\d{4}\\b");
    private static final Pattern COORDINATE = Pattern.compile("\\b(?:[0-8]?\\d(?:\\.\\d+)?|90(?:\\.0+)?),\\s*(?:1[0-7]\\d(?:\\.\\d+)?|180(?:\\.0+)?|\\d{1,2}(?:\\.\\d+)?)\\b");
    private static final Pattern DETAIL_ADDRESS = Pattern.compile("(?:[가-힣0-9]+(?:로|길)\\s*\\d+(?:-\\d+)?|[가-힣]+(?:동|읍|면)\\s*\\d+(?:-\\d+)?)");
    private static final Pattern PERSONAL_LABEL = Pattern.compile("(?<![가-힣])(?:집|회사)(?=$|[\\s,])|(?:집|회사)(?:에서|으로|근처|주소)");

    public void rejectSensitiveInput(String input) {
        String value = input == null ? "" : input;
        if (EMAIL.matcher(value).find() || PHONE.matcher(value).find() || COORDINATE.matcher(value).find() || DETAIL_ADDRESS.matcher(value).find() || PERSONAL_LABEL.matcher(value).find()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_PII_BLOCKED, "sensitive input must be resolved before provider use");
        }
    }
}
