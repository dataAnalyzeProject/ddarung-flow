package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import com.ddarungflow.service.PredictionLookupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class MapPredictionServiceTest {

    // 정시 30분 전(예: XX:50)에 고정해, 가까운 도보 후보라도 arrivalAt+30분이 다음 정시로 넘어가
    // TOO_SOON이 아닌 NORMAL로 판정되도록 한다. 벽시계 시간에 의존한 flaky 테스트를 방지한다.
    private static final Clock NOT_TOO_SOON_CLOCK =
        Clock.fixed(Instant.parse("2026-08-15T09:50:00Z"), ZoneOffset.ofHours(9));

    // 정시 직후(예: XX:05)에 고정해, 가까운 도보 후보의 arrivalAt+30분이 같은 시간대 안에 머물러
    // TOO_SOON으로 판정되도록 한다.
    private static final Clock TOO_SOON_CLOCK =
        Clock.fixed(Instant.parse("2026-08-15T09:05:00Z"), ZoneOffset.ofHours(9));

    @Test
    @DisplayName("승인된 공통 임계값으로 20개 조합의 확률 등급을 일관되게 매핑한다")
    void mapsApprovedAvailabilityBoundaries() {
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.2399")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.LOW);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.24")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.MEDIUM);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.3599")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.MEDIUM);
        assertThat(MapPredictionService.toAvailabilityLevel(new BigDecimal("0.36")))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.HIGH);
        assertThat(MapPredictionService.toAvailabilityLevel(BigDecimal.ZERO))
            .isEqualTo(PredictionApiDtos.AvailabilityLevel.LOW);
        assertThat(MapPredictionService.toAvailabilityLevel(null)).isNull();
    }

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private StationInventoryCurrentRepository inventoryRepository;

    @Autowired
    private com.ddarungflow.repository.StationPredictionRepository predictionRepository;

    private MapPredictionService mapPredictionService;

    @BeforeEach
    void setUp() {
        RouteCandidateService candidateService = new RouteCandidateService(stationRepository);
        PredictionLookupService predictionLookupService = new PredictionLookupService(predictionRepository);
        mapPredictionService = new MapPredictionService(candidateService, inventoryRepository, predictionLookupService, NOT_TOO_SOON_CLOCK);

        Station s1 = new Station("ST-4", "00102", "102. 망원역 1번출구 앞", new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true);
        stationRepository.save(s1);

        inventoryRepository.save(new StationInventoryCurrent("ST-4", 11, OffsetDateTime.now(), InventoryStatus.NORMAL));
    }

    @Test
    @DisplayName("후보지, 현재 재고, 예측 조립 시 정수 미터와 정수 초로 단위가 계산된다")
    void buildRouteCandidates() {
        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(1);
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.get(0);
        assertThat(dto.stationId()).isEqualTo("ST-4");
        assertThat(dto.availableBikeCount()).isEqualTo(11);
        assertThat(dto.inventoryStatus()).isEqualTo(InventoryStatus.NORMAL);
        assertThat(dto.distanceMeters()).isGreaterThanOrEqualTo(0);
        assertThat(dto.durationSeconds()).isGreaterThanOrEqualTo(0);
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.MISSING);
        assertThat(dto.availabilityLevel()).isNull();
    }

    @Test
    @DisplayName("한 후보의 예측 조회가 실패(예외)하더라도 다른 후보의 정상 응답이 누락되지 않고 격리된다")
    void partialCandidateFailureDoesNotMaskOtherCandidates() {
        // ST-5 추가 (예측 조회 실패 모의 대상)
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true);
        stationRepository.save(s2);
        inventoryRepository.save(new StationInventoryCurrent("ST-5", 3, OffsetDateTime.now(), InventoryStatus.NORMAL));

        PredictionLookupService failingPredictionService = new PredictionLookupService(predictionRepository) {
            @Override
            public java.util.Optional<com.ddarungflow.dto.PredictionLookupResult> findLatestValid(
                String stationId, OffsetDateTime predictionTargetAt, int minutesAhead, int requiredBikeCount, OffsetDateTime requestedAt
            ) {
                if ("ST-5".equals(stationId)) {
                    throw new RuntimeException("ST-5 ML Prediction Service Error");
                }
                return java.util.Optional.empty();
            }
        };

        RouteCandidateService candService = new RouteCandidateService(stationRepository);
        MapPredictionService serviceWithPartialFailure = new MapPredictionService(candService, inventoryRepository, failingPredictionService, NOT_TOO_SOON_CLOCK);

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = serviceWithPartialFailure.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        // ST-4, ST-5 둘 다 반환되며, ST-5의 ML 예외로 인해 ST-4가 사라지거나 전체가 예외를 내지 않음
        assertThat(results).hasSize(2);

        PredictionApiDtos.CandidatePredictionResponseDto st4 = results.stream().filter(r -> "ST-4".equals(r.stationId())).findFirst().orElseThrow();
        PredictionApiDtos.CandidatePredictionResponseDto st5 = results.stream().filter(r -> "ST-5".equals(r.stationId())).findFirst().orElseThrow();

        assertThat(st4.inventoryStatus()).isEqualTo(InventoryStatus.NORMAL);
        assertThat(st5.predictionProbability()).isNull(); // ST-5는 예측 실패로 probability null
        assertThat(st5.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("inventoryFailureForOneCandidateKeepsOtherCandidate: 후보 A(ST-5)의 재고 조회가 예외를 일으켜도 후보 B(ST-4)의 응답이 유지된다")
    void inventoryFailureForOneCandidateKeepsOtherCandidate() {
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true);
        stationRepository.save(s2);

        StationInventoryCurrentRepository failingInvRepo = org.mockito.Mockito.mock(StationInventoryCurrentRepository.class);
        org.mockito.Mockito.when(failingInvRepo.findById("ST-4")).thenReturn(inventoryRepository.findById("ST-4"));
        org.mockito.Mockito.when(failingInvRepo.findById("ST-5")).thenThrow(new RuntimeException("ST-5 DB Inventory Failure"));

        RouteCandidateService candService = new RouteCandidateService(stationRepository);
        PredictionLookupService predLookupService = new PredictionLookupService(predictionRepository);
        MapPredictionService service = new MapPredictionService(candService, failingInvRepo, predLookupService, NOT_TOO_SOON_CLOCK);

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(2);
        assertThat(results.stream().anyMatch(r -> "ST-4".equals(r.stationId()))).isTrue();
    }

    @Test
    @DisplayName("routeProviderFailureForOneCandidateKeepsOtherCandidate: 후보 A(ST-5)의 경로 provider가 예외를 일으켜도 후보 B(ST-4)가 유지된다")
    void routeProviderFailureForOneCandidateKeepsOtherCandidate() {
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5556000"), new BigDecimal("126.9106000"), true);
        stationRepository.save(s2);

        KakaoMapClient failingKakaoClient = new KakaoMapClient("https://dapi.kakao.com", "key", req -> {
            if (req.uri().toString().contains("126.9106000")) {
                throw new RuntimeException("ST-5 Route Provider Error");
            }
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> okRes = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
            org.mockito.Mockito.when(okRes.statusCode()).thenReturn(200);
            org.mockito.Mockito.when(okRes.body()).thenReturn("{ \"routes\": [{ \"summary\": { \"distance\": 600, \"duration\": 450 } }] }");
            return okRes;
        });

        RouteCandidateService candService = new RouteCandidateService(stationRepository, failingKakaoClient);
        PredictionLookupService predLookupService = new PredictionLookupService(predictionRepository);
        MapPredictionService service = new MapPredictionService(candService, inventoryRepository, predLookupService, NOT_TOO_SOON_CLOCK);

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(2);
        assertThat(results.stream().anyMatch(r -> "ST-4".equals(r.stationId()))).isTrue();
    }

    @Test
    @DisplayName("정시 직후 요청한 가까운 도보 후보는 TOO_SOON으로 판정되고 정상 확률 응답을 만들지 않는다")
    void nearbyWalkCandidateRightAfterHourIsTooSoon() {
        RouteCandidateService candService = new RouteCandidateService(stationRepository);
        PredictionLookupService predLookupService = new PredictionLookupService(predictionRepository);
        MapPredictionService service = new MapPredictionService(candService, inventoryRepository, predLookupService, TOO_SOON_CLOCK);

        List<PredictionApiDtos.CandidatePredictionResponseDto> results = service.buildRouteCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "WALK", 60, 1
        );

        assertThat(results).hasSize(1);
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.get(0);
        assertThat(dto.predictionStatus()).isEqualTo(PredictionApiDtos.PredictionStatus.TOO_SOON);
        assertThat(dto.predictionProbability()).isNull();
        assertThat(dto.probabilities()).isNull();
    }

    @Test
    @DisplayName("DIRECT 모드는 사용자가 입력한 도착 예정 분을 도착시각 계산에 사용한다")
    void directModeUsesUserSuppliedMinutesAhead() {
        List<PredictionApiDtos.CandidatePredictionResponseDto> results = mapPredictionService.buildDirectRoute(
            "ST-4", new BigDecimal("37.5500"), new BigDecimal("126.9000"), "DIRECT", 45, 1
        );

        assertThat(results).isNotEmpty();
        PredictionApiDtos.CandidatePredictionResponseDto dto = results.get(0);
        OffsetDateTime expectedArrivalAt = OffsetDateTime.now(NOT_TOO_SOON_CLOCK).plusMinutes(45);
        assertThat(dto.arrivalAt()).isEqualTo(expectedArrivalAt);
    }
}
