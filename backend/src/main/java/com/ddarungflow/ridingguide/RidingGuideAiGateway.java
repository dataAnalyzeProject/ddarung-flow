package com.ddarungflow.ridingguide;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.EvidenceSelectionValidator;

import java.util.List;

public interface RidingGuideAiGateway {
    GuideOutput generate(ConsumerAiEvidenceBundle evidence);

    record GuideOutput(
            String guideSummary,
            String rentalCandidateId,
            List<StopOutput> stops,
            List<String> routeEvidenceIds,
            List<String> weatherEvidenceIds,
            List<String> airQualityEvidenceIds,
            List<ConsumerAiEvidenceBundle.FactReference> factRefs,
            List<ConsumerAiEvidenceBundle.FactValue> factValues,
            String rationale,
            List<String> rationaleTags
    ) {
        public GuideOutput {
            stops = stops == null ? List.of() : List.copyOf(stops);
            routeEvidenceIds = routeEvidenceIds == null ? List.of() : List.copyOf(routeEvidenceIds);
            weatherEvidenceIds = weatherEvidenceIds == null ? List.of() : List.copyOf(weatherEvidenceIds);
            airQualityEvidenceIds = airQualityEvidenceIds == null ? List.of() : List.copyOf(airQualityEvidenceIds);
            factRefs = factRefs == null ? List.of() : List.copyOf(factRefs);
            factValues = factValues == null ? List.of() : List.copyOf(factValues);
            rationaleTags = rationaleTags == null ? List.of() : List.copyOf(rationaleTags);
        }

        EvidenceSelectionValidator.Selection selection() {
            return new EvidenceSelectionValidator.Selection(
                    rentalCandidateId,
                    stops.stream().map(stop -> new EvidenceSelectionValidator.StopSelection(
                            stop.poiId(), stop.stayMinutes())).toList(),
                    routeEvidenceIds,
                    weatherEvidenceIds,
                    airQualityEvidenceIds,
                    factRefs,
                    factValues,
                    rationale,
                    rationaleTags
            );
        }
    }

    record StopOutput(String poiId, Integer stayMinutes, String rationale) { }
}
