package com.ddarungflow.journey.ai;

public class JourneyAiException extends RuntimeException {
    private final JourneyAiErrorCode code;

    public JourneyAiException(JourneyAiErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public JourneyAiException(JourneyAiErrorCode code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public JourneyAiErrorCode code() {
        return code;
    }
}
