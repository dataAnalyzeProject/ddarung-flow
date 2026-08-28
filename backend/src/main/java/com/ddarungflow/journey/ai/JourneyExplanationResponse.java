package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.List;

public record JourneyExplanationResponse(String candidateId, List<String> factRefs, List<FactValue> factValues, String summary, List<String> tradeoffs) {
    public JourneyExplanationResponse {
        factRefs = factRefs == null ? List.of() : List.copyOf(factRefs);
        factValues = factValues == null ? List.of() : List.copyOf(factValues);
        summary = summary == null ? "" : summary;
        tradeoffs = tradeoffs == null ? List.of() : List.copyOf(tradeoffs);
    }

    public record FactValue(String ref, BigDecimal value) { }
}
