package com.ddarungflow.journey.ai;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EvidenceValidatorsTest {
    private final NumericFactValidator validator = new NumericFactValidator();
    private final EvidenceSelectionValidator selectionValidator = new EvidenceSelectionValidator();
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

    @Test
    void acceptsOnlyBundleBackedSelectionsAndReturnsAuthoritativeEvidence() {
        ConsumerAiEvidenceBundle.FactReference probability = ref(
                ConsumerAiEvidenceBundle.EvidenceType.RENTAL_CANDIDATE, "candidate-1", "rentalProbability");
        ConsumerAiEvidenceBundle.FactReference duration = ref(
                ConsumerAiEvidenceBundle.EvidenceType.ROUTE, "route-1", "durationSeconds");
        ConsumerAiEvidenceBundle.FactReference poiName = ref(
                ConsumerAiEvidenceBundle.EvidenceType.POI, "poi-1", "name");
        ConsumerAiEvidenceBundle.FactReference weatherStatus = ref(
                ConsumerAiEvidenceBundle.EvidenceType.WEATHER, "weather-1", "status");
        ConsumerAiEvidenceBundle.FactReference weatherTimestamp = ref(
                ConsumerAiEvidenceBundle.EvidenceType.WEATHER, "weather-1", "sourceTimestamp");

        EvidenceSelectionValidator.ValidatedSelection validated = selectionValidator.validate(
                evidenceBundle(),
                selection(
                        "candidate-1",
                        List.of(new EvidenceSelectionValidator.StopSelection("poi-1", 30)),
                        List.of("route-1"),
                        List.of("weather-1"),
                        List.of("air-1"),
                        List.of(probability, duration, poiName, weatherStatus, weatherTimestamp),
                        List.of(fact(probability, "0.88"), fact(duration, "600"))
                ),
                new EvidenceSelectionValidator.StayMinutesBounds(10, 120)
        );

        assertThat(validated.rentalCandidate().evidenceId()).isEqualTo("candidate-1");
        assertThat(validated.stops()).extracting(stop -> stop.poi().evidenceId()).containsExactly("poi-1");
        assertThat(validated.routes()).extracting(ConsumerAiEvidenceBundle.Evidence::evidenceId)
                .containsExactly("route-1");
        assertThat(validated.weather()).extracting(ConsumerAiEvidenceBundle.Evidence::status)
                .containsExactly(ConsumerAiEvidenceBundle.EvidenceStatus.MISSING);
        assertThat(validated.airQuality()).extracting(ConsumerAiEvidenceBundle.Evidence::status)
                .containsExactly(ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE);
    }

    @Test
    void rejectsUnknownTypedEvidenceIds() {
        assertSelectionMismatch(selection("candidate-x", List.of(), List.of(), List.of(), List.of(), List.of(), List.of()));
        assertSelectionMismatch(selection("candidate-1", List.of(new EvidenceSelectionValidator.StopSelection("poi-x", 30)), List.of(), List.of(), List.of(), List.of(), List.of()));
        assertSelectionMismatch(selection("candidate-1", List.of(), List.of("route-x"), List.of(), List.of(), List.of(), List.of()));
        assertSelectionMismatch(selection("candidate-1", List.of(), List.of(), List.of("weather-x"), List.of(), List.of(), List.of()));
        assertSelectionMismatch(selection("candidate-1", List.of(), List.of(), List.of(), List.of("air-x"), List.of(), List.of()));
    }

    @Test
    void rejectsDuplicateOrOutOfBoundsStops() {
        assertSelectionMismatch(selection(
                "candidate-1",
                List.of(
                        new EvidenceSelectionValidator.StopSelection("poi-1", 30),
                        new EvidenceSelectionValidator.StopSelection("poi-1", 40)
                ),
                List.of(), List.of(), List.of(), List.of(), List.of()
        ));
        assertSelectionMismatch(selection(
                "candidate-1",
                List.of(new EvidenceSelectionValidator.StopSelection("poi-1", 121)),
                List.of(), List.of(), List.of(), List.of(), List.of()
        ));
    }

    @Test
    void rejectsUnknownFactReferencesAndChangedNumericFacts() {
        ConsumerAiEvidenceBundle.FactReference unknown = ref(
                ConsumerAiEvidenceBundle.EvidenceType.WEATHER, "weather-1", "temperatureCelsius");
        assertSelectionMismatch(selection(
                "candidate-1", List.of(), List.of(), List.of("weather-1"), List.of(),
                List.of(unknown), List.of(fact(unknown, "0"))
        ));

        ConsumerAiEvidenceBundle.FactReference probability = ref(
                ConsumerAiEvidenceBundle.EvidenceType.RENTAL_CANDIDATE, "candidate-1", "rentalProbability");
        assertSelectionMismatch(selection(
                "candidate-1", List.of(), List.of(), List.of(), List.of(),
                List.of(probability), List.of(fact(probability, "0.89"))
        ));
    }

    @Test
    void keepsMissingAndUnavailableDistinctFromNormalZeroFacts() {
        EvidenceSelectionValidator.ValidatedSelection validated = selectionValidator.validate(
                evidenceBundle(),
                selection("candidate-1", List.of(), List.of(), List.of("weather-1", "weather-2"), List.of("air-1"), List.of(), List.of()),
                new EvidenceSelectionValidator.StayMinutesBounds(10, 120)
        );

        assertThat(validated.weather().getFirst().status()).isEqualTo(ConsumerAiEvidenceBundle.EvidenceStatus.MISSING);
        assertThat(validated.weather().getFirst().numericFacts()).isEmpty();
        assertThat(validated.weather().get(1).status()).isEqualTo(ConsumerAiEvidenceBundle.EvidenceStatus.STALE);
        assertThat(validated.weather().get(1).numericFacts()).containsEntry("temperatureCelsius", new BigDecimal("18"));
        assertThat(validated.airQuality().getFirst().status()).isEqualTo(ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE);
        assertThat(validated.airQuality().getFirst().numericFacts()).isEmpty();
    }

    @Test
    void preservesTooSoonPredictionWithoutInventingProbability() {
        EvidenceSelectionValidator.ValidatedSelection validated = selectionValidator.validate(
                evidenceBundle(),
                selection("candidate-too-soon", List.of(), List.of(), List.of(), List.of(), List.of(), List.of()),
                new EvidenceSelectionValidator.StayMinutesBounds(10, 120)
        );

        assertThat(validated.rentalCandidate().status()).isEqualTo(ConsumerAiEvidenceBundle.EvidenceStatus.TOO_SOON);
        assertThat(validated.rentalCandidate().numericFacts()).isEmpty();
    }

    private JourneyExplanationResponse response(String candidateId, String ref, BigDecimal value) {
        return new JourneyExplanationResponse(candidateId, List.of(ref), List.of(new JourneyExplanationResponse.FactValue(ref, value)), "근거 설명", List.of());
    }

    private void assertMismatch(JourneyExplanationResponse response) {
        assertThatThrownBy(() -> validator.validate(request, response))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH);
    }

    private ConsumerAiEvidenceBundle evidenceBundle() {
        return new ConsumerAiEvidenceBundle(
                Map.of(
                        "candidate-1", evidence(
                                "candidate-1", "prediction", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                                Map.of("rentalProbability", new BigDecimal("0.88"), "inventory", new BigDecimal("3"))
                        ),
                        "candidate-too-soon", evidence(
                                "candidate-too-soon", "prediction", ConsumerAiEvidenceBundle.EvidenceStatus.TOO_SOON,
                                Map.of()
                        )
                ),
                Map.of(
                        "poi-1", evidence(
                                "poi-1", "kakao", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                                Map.of("name", "한강공원"), Map.of("distanceMeters", new BigDecimal("450"))),
                        "poi-2", evidence("poi-2", "kakao", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL, Map.of("distanceMeters", new BigDecimal("700")))
                ),
                Map.of("route-1", evidence(
                        "route-1", "kakao-route", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                        Map.of("distanceMeters", new BigDecimal("2200"), "durationSeconds", new BigDecimal("600"), "path[0].latitude", new BigDecimal("37.5"))
                )),
                Map.of(
                        "weather-1", evidence("weather-1", "kma", ConsumerAiEvidenceBundle.EvidenceStatus.MISSING, Map.of()),
                        "weather-2", evidence("weather-2", "kma", ConsumerAiEvidenceBundle.EvidenceStatus.STALE, Map.of("temperatureCelsius", new BigDecimal("18")))
                ),
                Map.of("air-1", evidence("air-1", "air-korea", ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE, Map.of()))
        );
    }

    private ConsumerAiEvidenceBundle.Evidence evidence(
            String id,
            String source,
            ConsumerAiEvidenceBundle.EvidenceStatus status,
            Map<String, BigDecimal> numericFacts
    ) {
        return evidence(id, source, status, Map.of(), numericFacts);
    }

    private ConsumerAiEvidenceBundle.Evidence evidence(
            String id,
            String source,
            ConsumerAiEvidenceBundle.EvidenceStatus status,
            Map<String, String> textFacts,
            Map<String, BigDecimal> numericFacts
    ) {
        return new ConsumerAiEvidenceBundle.Evidence(
                id,
                source,
                status,
                OffsetDateTime.parse("2026-09-02T12:00:00+09:00"),
                textFacts,
                numericFacts
        );
    }

    private EvidenceSelectionValidator.Selection selection(
            String candidateId,
            List<EvidenceSelectionValidator.StopSelection> stops,
            List<String> routeIds,
            List<String> weatherIds,
            List<String> airQualityIds,
            List<ConsumerAiEvidenceBundle.FactReference> factRefs,
            List<ConsumerAiEvidenceBundle.FactValue> factValues
    ) {
        return new EvidenceSelectionValidator.Selection(
                candidateId,
                stops,
                routeIds,
                weatherIds,
                airQualityIds,
                factRefs,
                factValues,
                "근거 기반 선택",
                List.of("SHORT_RIDE")
        );
    }

    private ConsumerAiEvidenceBundle.FactReference ref(
            ConsumerAiEvidenceBundle.EvidenceType type,
            String evidenceId,
            String factName
    ) {
        return new ConsumerAiEvidenceBundle.FactReference(type, evidenceId, factName);
    }

    private ConsumerAiEvidenceBundle.FactValue fact(
            ConsumerAiEvidenceBundle.FactReference reference,
            String value
    ) {
        return new ConsumerAiEvidenceBundle.FactValue(reference, new BigDecimal(value));
    }

    private void assertSelectionMismatch(EvidenceSelectionValidator.Selection selection) {
        assertThatThrownBy(() -> selectionValidator.validate(
                evidenceBundle(), selection, new EvidenceSelectionValidator.StayMinutesBounds(10, 120)))
                .isInstanceOf(JourneyAiException.class)
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH);
    }
}
