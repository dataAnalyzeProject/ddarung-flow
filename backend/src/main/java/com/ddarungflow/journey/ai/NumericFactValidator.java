package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class NumericFactValidator extends EvidenceReferenceValidator {
    public void validate(JourneyExplanationRequest request, JourneyExplanationResponse response) {
        Map<String, BigDecimal> facts = factsFor(request, response);
        for (JourneyExplanationResponse.FactValue asserted : response.factValues()) {
            if (!response.factRefs().contains(asserted.ref()) || asserted.value() == null || facts.get(asserted.ref()) == null || facts.get(asserted.ref()).compareTo(asserted.value()) != 0) {
                throw mismatch("numeric fact does not match tool output");
            }
            if ((asserted.ref().equals("rentalProbability") || asserted.ref().equals("returnProbability"))
                    && (asserted.value().compareTo(BigDecimal.ZERO) < 0 || asserted.value().compareTo(BigDecimal.ONE) > 0)) {
                throw mismatch("probability must be between zero and one");
            }
        }
    }

    public void validate(
            ConsumerAiEvidenceBundle bundle,
            List<ConsumerAiEvidenceBundle.FactReference> references,
            List<ConsumerAiEvidenceBundle.FactValue> assertedValues
    ) {
        if (assertedValues == null) throw mismatch("numeric facts are missing");
        validateReferences(bundle, references);
        Set<ConsumerAiEvidenceBundle.FactReference> allowedReferences = Set.copyOf(references);
        Set<ConsumerAiEvidenceBundle.FactReference> assertedReferences = new HashSet<>();
        for (ConsumerAiEvidenceBundle.FactValue asserted : assertedValues) {
            if (asserted == null || asserted.reference() == null || asserted.value() == null
                    || !allowedReferences.contains(asserted.reference())
                    || !assertedReferences.add(asserted.reference())) {
                throw mismatch("numeric fact is not backed by a unique selected reference");
            }
            ConsumerAiEvidenceBundle.Evidence evidence = evidenceFor(bundle, asserted.reference());
            BigDecimal authoritative = evidence.numericFacts().get(asserted.reference().factName());
            if (authoritative == null || authoritative.compareTo(asserted.value()) != 0) {
                throw mismatch("numeric fact does not match evidence bundle");
            }
            validateProbability(asserted.reference().factName(), asserted.value());
        }
    }

    private void validateProbability(String factName, BigDecimal value) {
        if ((factName.equals("rentalProbability") || factName.equals("returnProbability"))
                && (value.compareTo(BigDecimal.ZERO) < 0 || value.compareTo(BigDecimal.ONE) > 0)) {
            throw mismatch("probability must be between zero and one");
        }
    }
}
