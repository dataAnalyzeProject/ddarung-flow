package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.Map;

public record JourneyExplanationRequest(Map<String, Map<String, BigDecimal>> candidateFacts) {
    public JourneyExplanationRequest {
        candidateFacts = candidateFacts == null ? Map.of() : Map.copyOf(candidateFacts);
    }
}
