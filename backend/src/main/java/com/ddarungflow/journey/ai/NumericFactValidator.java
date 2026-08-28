package com.ddarungflow.journey.ai;

import java.math.BigDecimal;
import java.util.Map;

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
}
