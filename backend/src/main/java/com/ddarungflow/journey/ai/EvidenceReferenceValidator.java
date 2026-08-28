package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.Map;

public class EvidenceReferenceValidator {
    public Map<String, BigDecimal> factsFor(JourneyExplanationRequest request, JourneyExplanationResponse response) {
        Map<String, BigDecimal> facts = request.candidateFacts().get(response.candidateId());
        if (facts == null) throw mismatch("unknown candidate");
        for (String ref : response.factRefs()) if (!facts.containsKey(ref)) throw mismatch("unknown fact reference");
        return facts;
    }

    protected JourneyAiException mismatch(String message) {
        return new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, message);
    }
}
