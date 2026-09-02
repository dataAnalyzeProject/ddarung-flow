package com.ddarungflow.ridingguide;

import com.ddarungflow.airquality.AirQualityResponse;
import com.ddarungflow.airquality.AirQualityService;
import com.ddarungflow.entity.Users;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.domain.JourneyArchetype;
import com.ddarungflow.journey.domain.JourneyCandidate;
import com.ddarungflow.journey.domain.JourneyStatus;
import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.NearbyPlaceService;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.map.StationQueryService;
import com.ddarungflow.payment.PremiumEntitlementService;
import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import com.ddarungflow.weather.WeatherStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RidingGuideServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-09-02T15:00:00+09:00");

    private final PremiumEntitlementService entitlement = mock(PremiumEntitlementService.class);
    private final StationQueryService stationQuery = mock(StationQueryService.class);
    private final MapPredictionService predictions = mock(MapPredictionService.class);
    private final WeatherArrivalService weather = mock(WeatherArrivalService.class);
    private final AirQualityService airQuality = mock(AirQualityService.class);
    private final NearbyPlaceService nearbyPlaces = mock(NearbyPlaceService.class);
    private final JourneyPlanService journeys = mock(JourneyPlanService.class);
    private final RidingGuideAiGateway ai = mock(RidingGuideAiGateway.class);
    private final Users user = Users.builder().provider("test").providerUserId("guide-user")
            .displayName("guide").build();
    private RidingGuideService service;

    @BeforeEach
    void setUp() {
        service = new RidingGuideService(entitlement, stationQuery, predictions, weather, airQuality,
                nearbyPlaces, journeys, ai, Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
        ReflectionTestUtils.setField(user, "id", 7L);
        when(stationQuery.findActiveLocation("ST-4")).thenReturn(Optional.of(
                new MapApiDtos.StationLocationResponseDto("ST-4", "004", "서울숲", bd("37.5"), bd("127.0"))));
        when(airQuality.getAirQuality("ST-4")).thenReturn(Optional.of(AirQualityResponse.unavailable(
                "ST-4", null, null, NOW)));
    }

    @Test
    void missingRentalContextOmitsRentalAndInventoryFactsAndDoesNotCallAi() {
        RidingGuideDtos.Response response = service.generate(user,
                new RidingGuideDtos.Request("ST-4", null, null, null, null, null, null, null));

        assertThat(response.status()).isEqualTo(RidingGuideDtos.Status.PARTIAL);
        assertThat(response.aiStatus()).isEqualTo(RidingGuideDtos.AiStatus.PARTIAL);
        assertThat(response.aiCode()).isEqualTo("RENTAL_CONTEXT_MISSING");
        assertThat(response.evidence().rentalCandidates()).isEmpty();
        assertThat(response.evidence().rentalCandidates().values())
                .allSatisfy(evidence -> assertThat(evidence.numericFacts()).doesNotContainKeys(
                        "rentalProbability", "availableBikeCount"));
        assertThat(response.evidence().airQuality()).hasSize(1);
        verify(entitlement).requireActive(user);
        verifyNoInteractions(predictions, weather, ai);
    }

    @Test
    void entitlementFailureStopsBeforeStationFactsOrAiProviderWork() {
        doThrow(new PremiumEntitlementService.PremiumRequired()).when(entitlement).requireActive(user);

        assertThatThrownBy(() -> service.generate(user,
                new RidingGuideDtos.Request("ST-4", null, null, null, null, null, null, null)))
                .isInstanceOf(PremiumEntitlementService.PremiumRequired.class);

        verifyNoInteractions(stationQuery, predictions, weather, airQuality, nearbyPlaces, journeys, ai);
    }

    @Test
    void providerUnavailablePreservesServerEvidenceAndDiscardsAiFields() {
        stubFactualEvidence();
        when(ai.generate(any())).thenThrow(new JourneyAiException(
                JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider unavailable"));

        RidingGuideDtos.Response response = service.generate(user, requestWithContext());

        assertThat(response.status()).isEqualTo(RidingGuideDtos.Status.PARTIAL);
        assertThat(response.aiStatus()).isEqualTo(RidingGuideDtos.AiStatus.UNAVAILABLE);
        assertThat(response.aiCode()).isEqualTo("AI_PROVIDER_UNAVAILABLE");
        assertThat(response.guideSummary()).isNull();
        assertThat(response.itineraryPreview()).isEmpty();
        assertThat(response.evidence().rentalCandidates()).containsKey("rental:ST-4");
        assertThat(response.evidence().rentalCandidates().get("rental:ST-4").textFacts())
                .containsEntry("inventoryCollectedAt", NOW.minusMinutes(2).toString())
                .containsEntry("arrivalAt", NOW.plusMinutes(30).toString())
                .containsEntry("predictionTargetAt", NOW.plusMinutes(30).toString())
                .containsEntry("featureAsOf", NOW.minusHours(1).toString())
                .containsEntry("generatedAt", NOW.toString());
        assertThat(response.evidence().weather()).containsKey("weather:ST-4");
        assertThat(response.evidence().airQuality()).containsKey("air-quality:ST-4");
        assertThat(response.evidence().pois()).containsKey("poi:POI-1");
    }

    @Test
    void evidenceMismatchFailsClosedAndReturnsNoGeneratedText() {
        stubFactualEvidence();
        when(ai.generate(any())).thenReturn(new RidingGuideAiGateway.GuideOutput(
                "생성 요약", "rental:invented", List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), "생성 근거", List.of("SAFE")));

        RidingGuideDtos.Response response = service.generate(user, requestWithContext());

        assertThat(response.aiCode()).isEqualTo("AI_TOOL_VALUE_MISMATCH");
        assertThat(response.guideSummary()).isNull();
        assertThat(response.rationale()).isNull();
        assertThat(response.itineraryPreview()).isEmpty();
        assertThat(response.evidence().rentalCandidates()).containsKey("rental:ST-4");
    }

    @Test
    void journeyDecisionSuppliesUserScopedRentalEvidenceWithoutNullOriginPrediction() {
        JourneyCandidate candidate = journeyCandidate();
        when(journeys.find(7L, "JRN-1")).thenReturn(new JourneyPlanService.Decision(
                "JRN-1", 1, JourneyStatus.READY, null, null, List.of(candidate), List.of(), NOW.plusHours(1)));
        when(weather.getArrivalWeather(any(), any(), any())).thenReturn(new WeatherForecastResult(
                "DESTINATION", candidate.arrivalAt(), candidate.arrivalAt(), NOW.minusHours(1), NOW,
                20.0, 0, 0, "CLEAR", false, List.of(), WeatherStatus.NORMAL));
        when(ai.generate(any())).thenThrow(new JourneyAiException(
                JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "disabled"));

        RidingGuideDtos.Response response = service.generate(user, new RidingGuideDtos.Request(
                "ST-4", "JRN-1", null, null, null, null, null, null));

        ConsumerAiEvidenceBundle.Evidence rental = response.evidence().rentalCandidates().get("rental:ST-4");
        assertThat(rental.source()).isEqualTo("journey-decision-core-prediction");
        assertThat(rental.sourceTimestamp()).isEqualTo(candidate.generatedAt());
        assertThat(rental.numericFacts()).containsEntry("rentalProbability", bd("0.82"));
        assertThat(rental.textFacts())
                .containsEntry("inventoryCollectedAt", candidate.inventoryCollectedAt().toString())
                .containsEntry("arrivalAt", candidate.arrivalAt().toString())
                .containsEntry("predictionTargetAt", candidate.predictionTargetAt().toString())
                .containsEntry("featureAsOf", candidate.featureAsOf().toString())
                .containsEntry("generatedAt", candidate.generatedAt().toString());
        verifyNoInteractions(predictions);
    }

    @Test
    void directMinutesRequireOriginPairAndInvalidPoiQueryStaysValidationFailure() {
        assertThatThrownBy(() -> service.generate(user, new RidingGuideDtos.Request(
                "ST-4", null, null, null, 30, 1, null, null)))
                .isInstanceOf(RidingGuideService.InvalidInput.class);

        stubFactualEvidence();
        when(nearbyPlaces.findNearby("ST-4", "NOT_A_THEME", 3)).thenThrow(new IllegalArgumentException());
        assertThatThrownBy(() -> service.generate(user, new RidingGuideDtos.Request(
                "ST-4", null, bd("37.4"), bd("127.1"), 30, 2, "NOT_A_THEME", 3)))
                .isInstanceOf(RidingGuideService.InvalidInput.class);
    }

    @Test
    void airQualityFailureBecomesUnavailableEvidenceAndInventedNumericProseFailsClosed() {
        stubFactualEvidence();
        when(airQuality.getAirQuality("ST-4")).thenThrow(new IllegalStateException("provider down"));
        when(ai.generate(any())).thenReturn(new RidingGuideAiGateway.GuideOutput(
                "대여 확률 90% 가이드", "rental:ST-4", List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), "서버 근거", List.of()));

        RidingGuideDtos.Response response = service.generate(user, requestWithContext());

        assertThat(response.evidence().airQuality().get("air-quality:ST-4").status())
                .isEqualTo(ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE);
        assertThat(response.aiCode()).isEqualTo("AI_OUTPUT_SCHEMA_INVALID");
        assertThat(response.guideSummary()).isNull();
    }

    @Test
    void validatedActualPoiSelectionReturnsShortPreview() {
        stubFactualEvidence();
        when(ai.generate(any())).thenReturn(new RidingGuideAiGateway.GuideOutput(
                "근거 기반 라이딩 가이드", "rental:ST-4",
                List.of(new RidingGuideAiGateway.StopOutput("poi:POI-1", 30, "실제 주변 장소입니다.")),
                List.of(), List.of("weather:ST-4"), List.of("air-quality:ST-4"),
                List.of(), List.of(), "서버 근거를 사용했습니다.", List.of("EVIDENCE_BACKED")));

        RidingGuideDtos.Response response = service.generate(user, requestWithContext());

        assertThat(response.aiStatus()).isEqualTo(RidingGuideDtos.AiStatus.AVAILABLE);
        assertThat(response.aiCode()).isNull();
        assertThat(response.guideSummary()).isEqualTo("근거 기반 라이딩 가이드");
        assertThat(response.itineraryPreview()).containsExactly(
                new RidingGuideDtos.ItineraryStop("poi:POI-1", 30, "실제 주변 장소입니다."));
    }

    private void stubFactualEvidence() {
        when(predictions.buildDirectRoute("ST-4", bd("37.4"), bd("127.1"), "WALK", 30, 2))
                .thenReturn(List.of(normalPrediction()));
        when(weather.getArrivalWeather(any(), any(), any())).thenReturn(new WeatherForecastResult(
                "DESTINATION", NOW.plusMinutes(30), NOW.plusMinutes(30), NOW.minusHours(1), NOW,
                23.5, 10, 0, "CLEAR", false, List.of(), WeatherStatus.NORMAL));
        when(airQuality.getAirQuality("ST-4")).thenReturn(Optional.of(new AirQualityResponse(
                "ST-4", "NORMAL", null, new AirQualityResponse.MeasurementStationDto("중구", 800),
                NOW.minusMinutes(20), NOW, new AirQualityResponse.KhaiDto(50.0, "GOOD", "1"),
                new AirQualityResponse.PollutantDto(20.0, "µg/m³", "GOOD", "1"),
                new AirQualityResponse.PollutantDto(10.0, "µg/m³", "GOOD", "1"),
                new AirQualityResponse.PollutantDto(0.03, "ppm", "GOOD", "1"))));
        when(nearbyPlaces.findNearby("ST-4", "PARK", 3)).thenReturn(List.of(
                new MapApiDtos.NearbyPlaceResponseDto("POI-1", "서울숲", "서울 성동구", "공원",
                        bd("37.5"), bd("127.0"), 250)));
    }

    private RidingGuideDtos.Request requestWithContext() {
        return new RidingGuideDtos.Request("ST-4", null, bd("37.4"), bd("127.1"), 30, 2, "PARK", 3);
    }

    private PredictionApiDtos.CandidatePredictionResponseDto normalPrediction() {
        return new PredictionApiDtos.CandidatePredictionResponseDto(
                "ST-4", "서울숲", bd("37.5"), bd("127.0"), 700, 500, 4, InventoryStatus.NORMAL,
                NOW.minusMinutes(2), bd("0.82"), new PredictionApiDtos.QuantityProbabilities(
                bd("0.92"), bd("0.82"), bd("0.70"), bd("0.55"), bd("0.40")),
                2, NOW.plusMinutes(30), NOW.plusMinutes(30), 30, 30, NOW.minusHours(1), null,
                PredictionApiDtos.AvailabilityLevel.HIGH, PredictionApiDtos.PredictionStatus.NORMAL,
                "model-1", NOW, List.of(), null, null);
    }

    private JourneyCandidate journeyCandidate() {
        return new JourneyCandidate(
                "candidate-1", JourneyArchetype.CORE_RENTAL, 1, bd("0.82"), null,
                null, null, null, null, null, null, null, null,
                "ST-4", "서울숲", bd("37.5"), bd("127.0"), 2, 4, "NORMAL", NOW.minusMinutes(2),
                "HIGH", 500, NOW.plusMinutes(30), NOW.plusMinutes(30), 30L, NOW.minusHours(1),
                "model-1", NOW, "NORMAL");
    }

    private BigDecimal bd(String value) { return new BigDecimal(value); }
}
