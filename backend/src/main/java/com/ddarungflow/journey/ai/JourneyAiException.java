package com.ddarungflow.journey.ai;

public class JourneyAiException extends RuntimeException {
    private final JourneyAiErrorCode code;
    private final JourneyAiFailureStage failureStage;

    public JourneyAiException(JourneyAiErrorCode code, String message) {
        this(code, message, null, null);
    }

    public JourneyAiException(JourneyAiErrorCode code, String message, Throwable cause) {
        this(code, message, cause, null);
    }

    public JourneyAiException(JourneyAiErrorCode code, String message, JourneyAiFailureStage failureStage) {
        this(code, message, null, failureStage);
    }

    public JourneyAiException(JourneyAiErrorCode code, String message, Throwable cause, JourneyAiFailureStage failureStage) {
        super(message, cause);
        this.code = code;
        this.failureStage = failureStage;
    }

    public JourneyAiErrorCode code() {
        return code;
    }

    public JourneyAiFailureStage failureStage() {
        return failureStage;
    }
}
