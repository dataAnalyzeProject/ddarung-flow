package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class EvidenceReferenceValidator {
    public Map<String, BigDecimal> factsFor(JourneyExplanationRequest request, JourneyExplanationResponse response) {
        Map<String, BigDecimal> facts = request.candidateFacts().get(response.candidateId());
        if (facts == null) throw mismatch("unknown candidate");
        for (String ref : response.factRefs()) if (!facts.containsKey(ref)) throw mismatch("unknown fact reference");
        return facts;
    }

    public void validateReferences(
            ConsumerAiEvidenceBundle bundle,
            List<ConsumerAiEvidenceBundle.FactReference> references
    ) {
        if (bundle == null || references == null) throw mismatch("evidence references are missing");
        Set<ConsumerAiEvidenceBundle.FactReference> unique = new HashSet<>();
        for (ConsumerAiEvidenceBundle.FactReference reference : references) {
            if (!unique.add(reference)) throw mismatch("duplicate fact reference");
            ConsumerAiEvidenceBundle.Evidence evidence = evidenceFor(bundle, reference);
            if (!evidence.hasFact(reference.factName())) {
                throw mismatch("unknown fact reference");
            }
        }
    }

    protected ConsumerAiEvidenceBundle.Evidence evidenceFor(
            ConsumerAiEvidenceBundle bundle,
            ConsumerAiEvidenceBundle.FactReference reference
    ) {
        if (reference == null || reference.factName() == null || reference.factName().isBlank()) {
            throw mismatch("invalid fact reference");
        }
        return evidenceFor(bundle, reference.type(), reference.evidenceId());
    }

    protected ConsumerAiEvidenceBundle.Evidence evidenceFor(
            ConsumerAiEvidenceBundle bundle,
            ConsumerAiEvidenceBundle.EvidenceType type,
            String evidenceId
    ) {
        if (bundle == null || type == null || evidenceId == null || evidenceId.isBlank()) {
            throw mismatch("invalid evidence reference");
        }
        ConsumerAiEvidenceBundle.Evidence evidence = bundle.find(type, evidenceId);
        if (evidence == null) throw mismatch("unknown evidence ID");
        return evidence;
    }

    protected JourneyAiException mismatch(String message) {
        return new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, message);
    }
}
