package com.ddarungflow.journey.ai;

import java.util.List;

public interface JourneyAiGateway {
    IntentResult compileIntent(String input);
    default IntentResult compileIntent(JourneyCompileRequest request) {
        return compileIntent(request.naturalLanguageText());
    }
    List<ToolCallRequest> validateToolPlan(List<ToolCallRequest> requests);

    record IntentResult(JourneyIntent intent, JourneyAiErrorCode unavailableCode) {
        public static IntentResult unavailable(JourneyAiErrorCode code) { return new IntentResult(null, code); }
        public boolean available() { return intent != null; }
    }
}
