package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class MapPredictionServiceTest {

    private static final Clock NOT_TOO_SOON_CLOCK =
        Clock.fixed(Instant.parse("2026-08-15T09:50:00Z"), ZoneOffset.ofHours(9));

    private static final Clock TOO_SOON_CLOCK =
        Clock.fixed(Instant.parse("2026-08-15T09:05:00Z"), ZoneOffset.ofHours(9));

    @Test
    @DisplayName("승인된 공통 임계값으로 20개 조합의 확률 등급을 일관되게 매핑한다")
    void mapsApprovedAvailabilityBoundaries() {
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.3999")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.LOW);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.40")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.MEDIUM);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.6999")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.MEDIUM);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.70")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.HIGH);
        assertThat(MapPredictionService.toAvailabilityLevel(BigDecimal.ZERO))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.LOW);
        assertThat(MapPredictionService.toAvailabilityLevel(null)).isNull();
    }

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private StationInventoryCurrentRepository inventoryRepository;

    private MapPredictionService mapPredictionService;
    private InferenceClient inferenceClient;

    @BeforeEach
    void setUp() {
        RouteCandidateService candidateService = routeCandidatesWithDuration(600);
        inferenceClient = org.mockito.Mockito.mock(InferenceClient.class);
        org.mockito.Mockito.when(inferenceClient.predict(org.mockito.ArgumentMatchers.anyList()))
            .thenAnswer(invocation -> normalInferenceResponse(candidateId(invocation)));
        mapPredictionService = new MapPredictionService(
            candidateService, inventoryRepository, inferenceClient, NOT_TOO_SOON_CLOCK
        );

        Station s1 = new Station(
            "ST-4", "00102", "102. 망원역 1번출구 앞",
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true
        );
        stationRepository.save(s1);

        inventoryRepository.save(new StationInventoryCurrent(
            "ST-4", 11, OffsetDateTime.now(NOT_TOO_SOON_CLOCK), InventoryStatus.NORMAL
        ));
    }

    @Test
    @DisplayName("정상 route evidence를 응답에 보존하고 동일 duration으로 arrivalAt과 확률 horizon을 계산한다")
    void buildRouteCandidatesUsesSameRouteEvidence() {
        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(1);
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.getFirst();
        assertThat(dto.stationId()).isEqualTo("ST-4");
        assertThat(dto.availableBikeCount()).isEqualTo(11);
        assertThat(dto.inventoryStatus()).isEqualTo(InventoryStatus.NORMAL);
        assertThat(dto.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(dto.routeDetail()).isNotNull();
        assertThat(dto.routeDetail().distanceMeters()).isEqualTo(800);
        assertThat(dto.routeDetail().durationSeconds()).isEqualTo(600);
        assertThat(dto.routeDetail().travelMode()).isEqualTo("WALK");
        assertThat(dto.distanceMeters()).isEqualTo(dto.routeDetail().distanceMeters());
        assertThat(dto.durationSeconds()).isEqualTo(dto.routeDetail().durationSeconds());
        assertThat(Duration.between(OffsetDateTime.now(NOT_TOO_SOON_CLOCK), dto.arrivalAt()).getSeconds())
            .isEqualTo(dto.routeDetail().durationSeconds());
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.NORMAL);
        assertThat(dto.predictionProbability()).isEqualByComparingTo("0.75");
        assertThat(dto.availabilityLevel()).isEqualTo(PredictionApiDtos.AvailabilityLevel.HIGH);
        assertThat(dto.horizonOutlook()).hasSize(4);
        assertThat(dto.horizonOutlook()).allSatisfy(outlook -> {
            assertThat(outlook.predictionTargetAt()).isEqualTo(dto.featureAsOf().plusMinutes(outlook.horizonMinutes()));
            assertThat(outlook.availabilityLevel()).isEqualTo(MapPredictionService.toAvailabilityLevel(outlook.probability()));
        });
        assertThat(dto.horizonOutlook()).filteredOn(PredictionApiDtos.HorizonOutlook::isSelected)
            .singleElement().extracting(PredictionApiDtos.HorizonOutlook::horizonMinutes)
            .isEqualTo(dto.horizonMinutes());
    }

    @Test
    @DisplayName("한 후보의 예측 조회가 실패해도 다른 후보의 정상 응답을 유지한다")
    void partialCandidateFailureDoesNotMaskOtherCandidates() {
        Station s2 = new Station(
            "ST-5", "00103", "103. 망원한강공원 앞",
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true
        );
        stationRepository.save(s2);
        inventoryRepository.save(new StationInventoryCurrent(
            "ST-5", 3, OffsetDateTime.now(NOT_TOO_SOON_CLOCK), InventoryStatus.NORMAL
        ));

        InferenceClient failingPredictionService = org.mockito.Mockito.mock(InferenceClient.class);
        org.mockito.Mockito.when(failingPredictionService.predict(org.mockito.ArgumentMatchers.anyList()))
            .thenAnswer(invocation -> {
                String stationId = candidateId(invocation);
                if ("ST-5".equals(stationId)) {
                    throw new RuntimeException("ST-5 ML Prediction Service Error");
                }
                return normalInferenceResponse(stationId);
            });

        MapPredictionService serviceWithPartialFailure = new MapPredictionService(
            routeCandidatesWithDuration(600), inventoryRepository, failingPredictionService, NOT_TOO_SOON_CLOCK
        );

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = serviceWithPartialFailure.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(2);
        PredictionApiDtos.CandidatePredictionResponseDto st4 = results.stream()
            .filter(r -> "ST-4".equals(r.stationId())).findFirst().orElseThrow();
        PredictionApiDtos.CandidatePredictionResponseDto st5 = results.stream()
            .filter(r -> "ST-5".equals(r.stationId())).findFirst().orElseThrow();

        assertThat(st4.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(st4.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.NORMAL);
        assertThat(st5.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(st5.predictionProbability()).isNull();
        assertThat(st5.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("한 후보의 재고 조회 실패가 다른 후보 응답을 가리지 않는다")
    void inventoryFailureForOneCandidateKeepsOtherCandidate() {
        Station s2 = new Station(
            "ST-5", "00103", "103. 망원한강공원 앞",
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true
        );
        stationRepository.save(s2);

        StationInventoryCurrentRepository failingInvRepo = org.mockito.Mockito.mock(StationInventoryCurrentRepository.class);
        org.mockito.Mockito.when(failingInvRepo.findById("ST-4")).thenReturn(inventoryRepository.findById("ST-4"));
        org.mockito.Mockito.when(failingInvRepo.findById("ST-5"))
            .thenThrow(new RuntimeException("ST-5 DB Inventory Failure"));

        MapPredictionService service = new MapPredictionService(
            routeCandidatesWithDuration(600), failingInvRepo, inferenceClient, NOT_TOO_SOON_CLOCK
        );

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(2);
        assertThat(results.stream().anyMatch(r -> "ST-4".equals(r.stationId()))).isTrue();
    }

    @Test
    @DisplayName("route provider 실패 candidate는 route/prediction UNAVAILABLE이며 inference를 호출하지 않는다")
    void routeProviderFailureDoesNotCreateSyntheticProbability() {
        Station s2 = new Station(
            "ST-5", "00103", "103. 망원한강공원 앞",
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true
        );
        stationRepository.save(s2);
        inventoryRepository.save(new StationInventoryCurrent(
            "ST-5", 3, OffsetDateTime.now(NOT_TOO_SOON_CLOCK), InventoryStatus.NORMAL
        ));

        KakaoMapClient failingKakaoClient = new KakaoMapClient("https://dapi.kakao.com", "key", req -> {
            if (req.uri().toString().contains("126.9106000")) {
                throw new RuntimeException("ST-5 Route Provider Error");
            }
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> okRes = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
            org.mockito.Mockito.when(okRes.statusCode()).thenReturn(200);
            org.mockito.Mockito.when(okRes.body()).thenReturn(
                "{\"route\":{\"properties\":{\"totalDistance\":600,\"totalTime\":450}}}"
            );
            return okRes;
        });

        RouteCandidateService candService = new RouteCandidateService(stationRepository, failingKakaoClient);
        MapPredictionService service = new MapPredictionService(
            candService, inventoryRepository, inferenceClient, NOT_TOO_SOON_CLOCK
        );

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(2);
        PredictionApiDtos.CandidatePredictionResponseDto st4 = results.stream()
            .filter(r -> "ST-4".equals(r.stationId())).findFirst().orElseThrow();
        PredictionApiDtos.CandidatePredictionResponseDto st5 = results.stream()
            .filter(r -> "ST-5".equals(r.stationId())).findFirst().orElseThrow();

        assertThat(st4.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(st4.routeDetail()).isNotNull();
        assertThat(st4.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.NORMAL);

        assertThat(st5.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.UNAVAILABLE);
        assertThat(st5.routeDetail()).isNull();
        assertThat(st5.distanceMeters()).isNull();
        assertThat(st5.durationSeconds()).isNull();
        assertThat(st5.arrivalAt()).isNull();
        assertThat(st5.predictionTargetAt()).isNull();
        assertThat(st5.predictionProbability()).isNull();
        assertThat(st5.probabilities()).isNull();
        assertThat(st5.horizonOutlook()).isNull();
        assertThat(st5.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.UNAVAILABLE);
        org.mockito.Mockito.verify(inferenceClient, org.mockito.Mockito.times(1))
            .predict(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    @DisplayName("정시 직후 요청한 가까운 도보 후보는 TOO_SOON이고 정상 확률을 만들지 않는다")
    void nearbyWalkCandidateRightAfterHourIsTooSoon() {
        MapPredictionService service = new MapPredictionService(
            routeCandidatesWithDuration(600), inventoryRepository, inferenceClient, TOO_SOON_CLOCK
        );

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(1);
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.getFirst();
        assertThat(dto.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.TOO_SOON);
        assertThat(dto.predictionProbability()).isNull();
        assertThat(dto.probabilities()).isNull();
        assertThat(dto.horizonOutlook()).isNull();
    }

    @Test
    @DisplayName("DIRECT 모드는 사용자가 입력한 도착 예정 분을 도착시각 계산에 사용한다")
    void directModeUsesUserSuppliedMinutesAhead() {
        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildDirectRoute(
            "ST-4", new BigDecimal("37.5500"), new BigDecimal("126.9000"), "DIRECT", 45, 1
        );

        assertThat(results).isNotEmpty();
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.getFirst();
        OffsetDateTime expectedArrivalAt = OffsetDateTime.now(NOT_TOO_SOON_CLOCK).plusMinutes(45);
        assertThat(dto.arrivalAt()).isEqualTo(expectedArrivalAt);
        assertThat(dto.routeStatus()).isNull();
        assertThat(dto.routeDetail()).isNull();
    }

    @Test
    @DisplayName("10분보다 오래된 재고는 DELAYED로 표시하고 모델을 호출하지 않는다")
    void staleInventoryDoesNotCallInference() {
        inventoryRepository.save(new StationInventoryCurrent(
            "ST-4", 11, OffsetDateTime.now(NOT_TOO_SOON_CLOCK).minusMinutes(11), InventoryStatus.NORMAL
        ));

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        PredictionApiDtos.CandidatePredictionResponseDto dto = results.getFirst();
        assertThat(dto.inventoryStatus()).isEqualTo(InventoryStatus.DELAYED);
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.MISSING);
        assertThat(dto.predictionProbability()).isNull();
        org.mockito.Mockito.verifyNoInteractions(inferenceClient);
    }

    @Test
    @DisplayName("Journey departureAt으로 선택한 H1~H4만큼의 Core 확률과 시간 정보를 함께 계산한다")
    void journeyDepartureAtSelectsMatchingCoreHorizon() {
        RouteCandidateService candidateService = routeCandidatesWithDuration(600);
        MapPredictionService service = new MapPredictionService(
            candidateService, inventoryRepository, inferenceClient, TOO_SOON_CLOCK
        );
        org.mockito.Mockito.doAnswer(invocation -> horizonSpecificInferenceResponse(candidateId(invocation)))
            .when(inferenceClient).predict(org.mockito.ArgumentMatchers.anyList());
        OffsetDateTime featureAsOf = OffsetDateTime.now(TOO_SOON_CLOCK)
            .truncatedTo(java.time.temporal.ChronoUnit.HOURS);

        for (int horizon : List.of(60, 120, 180, 240)) {
            OffsetDateTime departureAt = OffsetDateTime.now(TOO_SOON_CLOCK)
                .plusMinutes(15L + (horizon - 60));
            PredictionApiDtos.CandidatePredictionResponseDto dto = service.buildJourneyRouteCandidates(
                // Journey rents at the origin, so the rider starts next to ST-4 and rides away from it.
                new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
                new BigDecimal("37.5500"), new BigDecimal("126.9000"), departureAt, 1
            ).getFirst();

            assertThat(dto.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
            assertThat(dto.routeDetail().durationSeconds()).isEqualTo(600);
            assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.NORMAL);
            assertThat(dto.arrivalAt()).isEqualTo(departureAt.plusSeconds(dto.routeDetail().durationSeconds()));
            assertThat(dto.featureAsOf()).isEqualTo(featureAsOf);
            assertThat(dto.horizonMinutes()).isEqualTo(horizon);
            assertThat(dto.predictionTargetAt()).isEqualTo(featureAsOf.plusMinutes(horizon));
            assertThat(dto.predictionProbability()).isEqualByComparingTo("0." + (60 + horizon / 60));
        }
    }

    @Test
    @DisplayName("Journey departureAt이 H1~H4 밖이면 Core가 확률을 만들지 않는다")
    void journeyDepartureAtOutsideCoreHorizonsIsUnavailableWithoutProbability() {
        InferenceClient unusedInference = org.mockito.Mockito.mock(InferenceClient.class);
        MapPredictionService service = new MapPredictionService(
            routeCandidatesWithDuration(600), inventoryRepository, unusedInference, TOO_SOON_CLOCK
        );
        OffsetDateTime departureAt = OffsetDateTime.now(TOO_SOON_CLOCK).plusHours(4).plusMinutes(15);

        PredictionApiDtos.CandidatePredictionResponseDto dto = service.buildJourneyRouteCandidates(
            // Journey rents at the origin, so the rider starts next to ST-4 and rides away from it.
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            new BigDecimal("37.5500"), new BigDecimal("126.9000"), departureAt, 1
        ).getFirst();

        assertThat(dto.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.UNAVAILABLE);
        assertThat(dto.predictionProbability()).isNull();
        assertThat(dto.featureAsOf()).isNull();
        org.mockito.Mockito.verifyNoInteractions(unusedInference);
    }

    private RouteCandidateService routeCandidatesWithDuration(int durationSeconds) {
        KakaoMapClient client = new KakaoMapClient("https://dapi.kakao.com", "key", request -> {
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> response = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
            org.mockito.Mockito.when(response.statusCode()).thenReturn(200);
            org.mockito.Mockito.when(response.body()).thenReturn(
                "{\"route\":{\"properties\":{\"totalDistance\":800,\"totalTime\":" + durationSeconds + "}}}"
            );
            return response;
        });
        return new RouteCandidateService(stationRepository, client);
    }

    @SuppressWarnings("unchecked")
    private static String candidateId(org.mockito.invocation.InvocationOnMock invocation) {
        List<InferenceDtos.CandidateRequest> requests = invocation.getArgument(0);
        return requests.getFirst().stationId();
    }

    private static InferenceDtos.PredictResponse normalInferenceResponse(String stationId) {
        List<InferenceDtos.ProbabilityRow> rows = new java.util.ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) {
            for (int quantity = 1; quantity <= 5; quantity++) {
                rows.add(new InferenceDtos.ProbabilityRow(
                    horizon,
                    quantity,
                    new BigDecimal("0.80").subtract(
                        new BigDecimal("0.05").multiply(BigDecimal.valueOf(quantity))
                    )
                ));
            }
        }
        return new InferenceDtos.PredictResponse(
            "NORMAL",
            null,
            "hist_gradient_boosting@2f2ece729fd4",
            OffsetDateTime.parse("2026-08-15T09:50:01Z"),
            List.of(new InferenceDtos.CandidatePrediction(stationId, "NORMAL", rows))
        );
    }

    private static InferenceDtos.PredictResponse horizonSpecificInferenceResponse(String stationId) {
        List<InferenceDtos.ProbabilityRow> rows = new java.util.ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) {
            for (int quantity = 1; quantity <= 5; quantity++) {
                rows.add(new InferenceDtos.ProbabilityRow(
                    horizon,
                    quantity,
                    new BigDecimal("0." + (60 + horizon / 60))
                        .subtract(new BigDecimal("0.01").multiply(BigDecimal.valueOf(quantity - 1)))
                ));
            }
        }
        return new InferenceDtos.PredictResponse(
            "NORMAL",
            null,
            "model@horizon",
            OffsetDateTime.parse("2026-08-15T09:05:01+09:00"),
            List.of(new InferenceDtos.CandidatePrediction(stationId, "NORMAL", rows))
        );
    }
}
