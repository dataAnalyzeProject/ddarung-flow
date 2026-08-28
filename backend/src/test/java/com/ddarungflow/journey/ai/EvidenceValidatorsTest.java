package com.ddarungflow.journey.ai;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EvidenceValidatorsTest {
    private final NumericFactValidator validator = new NumericFactValidator();
    private final JourneyExplanationRequest request = new JourneyExplanationRequest(Map.of("JRN-A", Map.of("rentalProbability", new BigDecimal("0.88"), "rideMinutes", new BigDecimal("54"))));

    @Test
    void acceptsExactFactReferencesAndValues() {
        assertThatCode(() -> validator.validate(request, response("JRN-A", "rentalProbability", new BigDecimal("0.88"))))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsUnknownCandidateMissingEvidenceAndChangedNumbers() {
        assertMismatch(response("JRN-B", "rentalProbability", new BigDecimal("0.88")));
        assertMismatch(response("JRN-A", "returnProbability", new BigDecimal("0.80")));
        assertMismatch(response("JRN-A", "rentalProbability", new BigDecimal("0.89")));
    }

    @Test
    void rejectsProbabilityOutsideAllowedRangeEvenWhenToolFactMatches() {
        JourneyExplanationRequest invalidProbability = new JourneyExplanationRequest(Map.of("JRN-A", Map.of("rentalProbability", new BigDecimal("1.01"))));
        assertThatThrownBy(() -> validator.validate(invalidProbability, response("JRN-A", "rentalProbability", new BigDecimal("1.01"))))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH);
    }

    private JourneyExplanationResponse response(String candidateId, String ref, BigDecimal value) {
        return new JourneyExplanationResponse(candidateId, List.of(ref), List.of(new JourneyExplanationResponse.FactValue(ref, value)), "근거 설명", List.of());
    }

    private void assertMismatch(JourneyExplanationResponse response) {
        assertThatThrownBy(() -> validator.validate(request, response))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH);
    }
}
