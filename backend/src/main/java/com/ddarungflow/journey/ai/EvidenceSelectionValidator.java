package com.ddarungflow.journey.ai;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class EvidenceSelectionValidator extends EvidenceReferenceValidator {
    private final NumericFactValidator numericFactValidator;

    public EvidenceSelectionValidator() {
        this(new NumericFactValidator());
    }

    EvidenceSelectionValidator(NumericFactValidator numericFactValidator) {
        this.numericFactValidator = numericFactValidator;
    }

    public ValidatedSelection validate(
            ConsumerAiEvidenceBundle bundle,
            Selection selection,
            StayMinutesBounds stayMinutesBounds
    ) {
        if (bundle == null || selection == null || stayMinutesBounds == null) {
            throw mismatch("evidence selection input is missing");
        }

        ConsumerAiEvidenceBundle.Evidence rentalCandidate = evidenceFor(
                bundle,
                ConsumerAiEvidenceBundle.EvidenceType.RENTAL_CANDIDATE,
                selection.rentalCandidateId()
        );
        List<ValidatedStop> stops = validateStops(bundle, selection.stops(), stayMinutesBounds);
        List<ConsumerAiEvidenceBundle.Evidence> routes = validateIds(
                bundle, ConsumerAiEvidenceBundle.EvidenceType.ROUTE, selection.routeEvidenceIds());
        List<ConsumerAiEvidenceBundle.Evidence> weather = validateIds(
                bundle, ConsumerAiEvidenceBundle.EvidenceType.WEATHER, selection.weatherEvidenceIds());
        List<ConsumerAiEvidenceBundle.Evidence> airQuality = validateIds(
                bundle, ConsumerAiEvidenceBundle.EvidenceType.AIR_QUALITY, selection.airQualityEvidenceIds());
        validateRationaleTags(selection.rationaleTags());
        numericFactValidator.validate(bundle, selection.factRefs(), selection.factValues());

        return new ValidatedSelection(
                rentalCandidate,
                stops,
                routes,
                weather,
                airQuality,
                selection.rationale(),
                selection.rationaleTags()
        );
    }

    private List<ValidatedStop> validateStops(
            ConsumerAiEvidenceBundle bundle,
            List<StopSelection> selections,
            StayMinutesBounds bounds
    ) {
        List<ValidatedStop> result = new ArrayList<>();
        Set<String> selectedIds = new HashSet<>();
        for (StopSelection selection : selections) {
            if (selection == null || selection.stayMinutes() == null
                    || !bounds.includes(selection.stayMinutes())) {
                throw mismatch("invalid stop selection");
            }
            if (!selectedIds.add(selection.poiId())) {
                throw mismatch("duplicate stop ID");
            }
            result.add(new ValidatedStop(
                    evidenceFor(bundle, ConsumerAiEvidenceBundle.EvidenceType.POI, selection.poiId()),
                    selection.stayMinutes()
            ));
        }
        return List.copyOf(result);
    }

    private List<ConsumerAiEvidenceBundle.Evidence> validateIds(
            ConsumerAiEvidenceBundle bundle,
            ConsumerAiEvidenceBundle.EvidenceType type,
            List<String> evidenceIds
    ) {
        List<ConsumerAiEvidenceBundle.Evidence> result = new ArrayList<>();
        Set<String> selectedIds = new HashSet<>();
        for (String evidenceId : evidenceIds) {
            if (!selectedIds.add(evidenceId)) throw mismatch("duplicate evidence ID");
            result.add(evidenceFor(bundle, type, evidenceId));
        }
        return List.copyOf(result);
    }

    private void validateRationaleTags(List<String> rationaleTags) {
        if (rationaleTags.stream().anyMatch(tag -> tag == null || tag.isBlank())) {
            throw mismatch("invalid rationale tag");
        }
    }

    public record Selection(
            String rentalCandidateId,
            List<StopSelection> stops,
            List<String> routeEvidenceIds,
            List<String> weatherEvidenceIds,
            List<String> airQualityEvidenceIds,
            List<ConsumerAiEvidenceBundle.FactReference> factRefs,
            List<ConsumerAiEvidenceBundle.FactValue> factValues,
            String rationale,
            List<String> rationaleTags
    ) {
        public Selection {
            stops = copyList(stops);
            routeEvidenceIds = copyList(routeEvidenceIds);
            weatherEvidenceIds = copyList(weatherEvidenceIds);
            airQualityEvidenceIds = copyList(airQualityEvidenceIds);
            factRefs = copyList(factRefs);
            factValues = copyList(factValues);
            rationaleTags = copyList(rationaleTags);
        }

        private static <T> List<T> copyList(List<T> values) {
            if (values == null) return List.of();
            return Collections.unmodifiableList(new ArrayList<>(values));
        }
    }

    public record StopSelection(String poiId, Integer stayMinutes) {}

    public record StayMinutesBounds(int minimum, int maximum) {
        public StayMinutesBounds {
            if (minimum < 0 || maximum < minimum) {
                throw new IllegalArgumentException("invalid stay-minute bounds");
            }
        }

        boolean includes(int stayMinutes) {
            return stayMinutes >= minimum && stayMinutes <= maximum;
        }
    }

    public record ValidatedStop(ConsumerAiEvidenceBundle.Evidence poi, int stayMinutes) {}

    public record ValidatedSelection(
            ConsumerAiEvidenceBundle.Evidence rentalCandidate,
            List<ValidatedStop> stops,
            List<ConsumerAiEvidenceBundle.Evidence> routes,
            List<ConsumerAiEvidenceBundle.Evidence> weather,
            List<ConsumerAiEvidenceBundle.Evidence> airQuality,
            String rationale,
            List<String> rationaleTags
    ) {}
}
