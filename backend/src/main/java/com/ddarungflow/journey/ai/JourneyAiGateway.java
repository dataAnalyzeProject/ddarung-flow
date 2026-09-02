package com.ddarungflow.journey.ai;

import java.util.List;

public interface JourneyAiGateway {
    IntentResult compileIntent(String input);
    default IntentResult compileIntent(JourneyCompileRequest request) {
        return compileIntent(request.naturalLanguageText());
    }
    List<ToolCallRequest> validateToolPlan(List<ToolCallRequest> requests);

    default ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
        return ScheduleResult.unavailable(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
    }

    record IntentResult(JourneyIntent intent, JourneyAiErrorCode unavailableCode) {
        public static IntentResult unavailable(JourneyAiErrorCode code) { return new IntentResult(null, code); }
        public boolean available() { return intent != null; }
    }

    record ScheduleConstraints(int maximumStops, int minimumStayMinutes, int maximumStayMinutes,
                               int availableMinutes) {
        public ScheduleConstraints {
            if (maximumStops < 0 || maximumStops > 3 || minimumStayMinutes < 1
                    || maximumStayMinutes < minimumStayMinutes || availableMinutes < 1) {
                throw new IllegalArgumentException("invalid schedule constraints");
            }
        }
    }

    record ScheduleResult(EvidenceSelectionValidator.Selection selection, JourneyAiErrorCode unavailableCode) {
        public static ScheduleResult unavailable(JourneyAiErrorCode code) { return new ScheduleResult(null, code); }
        public boolean available() { return selection != null; }
    }
}
