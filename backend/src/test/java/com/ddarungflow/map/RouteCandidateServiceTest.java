package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class RouteCandidateServiceTest {

    @Autowired
    private StationRepository stationRepository;

    private RouteCandidateService candidateService;

    @BeforeEach
    void setUp() {
        KakaoMapClient unavailableClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            throw new RuntimeException("provider unavailable in discovery-only test");
        });
        candidateService = new RouteCandidateService(stationRepository, unavailableClient);

        Station s1 = new Station("ST-4", "00102", "102. 망원역 1번출구 앞", new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true);
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5523000"), new BigDecimal("126.8991000"), true);
        Station s3 = new Station("ST-6", "00104", "104. 합정역", new BigDecimal("37.5490000"), new BigDecimal("126.9130000"), true);
        Station s4 = new Station("ST-7", "00105", "105. 홍대입구역", new BigDecimal("37.5570000"), new BigDecimal("126.9240000"), true);
        Station s5 = new Station("ST-8", "00106", "106. 상수역", new BigDecimal("37.5470000"), new BigDecimal("126.9220000"), true);
        Station s6 = new Station("ST-9", "00107", "107. 신촌역", new BigDecimal("37.5590000"), new BigDecimal("126.9360000"), true);

        stationRepository.save(s1);
        stationRepository.save(s2);
        stationRepository.save(s3);
        stationRepository.save(s4);
        stationRepository.save(s5);
        stationRepository.save(s6);
    }

    @Test
    @DisplayName("500m 이내 후보가 있으면 1km로 넓히지 않는다")
    void findCandidates500mPriority() {
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "WALK"
        );

        assertThat(candidates).hasSize(1);
        assertThat(candidates.get(0).station().getStationId()).isEqualTo("ST-4");
    }

    @Test
    @DisplayName("500m 이내 후보가 0개일 때만 1km 범위로 확장한다")
    void findCandidatesExpandTo1kmWhenZeroIn500m() {
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5580000"), new BigDecimal("126.9030000"),
            "WALK"
        );

        assertThat(candidates).isNotEmpty();
    }

    @Test
    @DisplayName("후보를 discovery 거리순으로 정렬하고 최대 5개만 반환한다")
    void findCandidatesLimitsToMax5() {
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5530000"), new BigDecimal("126.9150000"),
            "WALK"
        );

        assertThat(candidates.size()).isLessThanOrEqualTo(5);
    }

    @Test
    @DisplayName("discovery에서 최대 5개를 먼저 확정한 뒤에만 route provider를 호출한다")
    void selectsMaxFiveBeforeCallingRouteProvider() {
        for (int i = 0; i < 6; i++) {
            stationRepository.save(new Station(
                "COUNT-" + i,
                "0090" + i,
                "provider count station " + i,
                new BigDecimal("37.555" + i),
                new BigDecimal("126.9100"),
                true
            ));
        }

        AtomicInteger calls = new AtomicInteger();
        KakaoMapClient countingClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            calls.incrementAndGet();
            return response("{\"route\":{\"properties\":{\"totalDistance\":800,\"totalTime\":600}}}");
        });
        RouteCandidateService service = new RouteCandidateService(stationRepository, countingClient);

        List<RouteCandidateService.StationDistance> candidates = service.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5550"), new BigDecimal("126.9100"),
            "WALK"
        );

        assertThat(candidates).hasSize(5);
        assertThat(calls.get()).isEqualTo(candidates.size()).isLessThanOrEqualTo(5);
        assertThat(candidates).allSatisfy(candidate -> {
            assertThat(candidate.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
            assertThat(candidate.routeDetail()).isNotNull();
        });
    }

    @Test
    @DisplayName("direct 요청의 지정 stationId는 #1로 유지되고 주변 후보와 중복 추가되지 않는다")
    void findCandidatesForDirectKeepsPrimaryFirstAndNoDuplicates() {
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidatesForDirect(
            "ST-4",
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556488"), new BigDecimal("126.91062927"),
            "DIRECT"
        );

        assertThat(candidates).isNotEmpty();
        assertThat(candidates.get(0).station().getStationId()).isEqualTo("ST-4");
        long countSt4 = candidates.stream().filter(c -> c.station().getStationId().equals("ST-4")).count();
        assertThat(countSt4).isEqualTo(1);
    }

    @Test
    @DisplayName("travelMode(WALK vs TRANSIT)에 따라 실제 provider route detail을 그대로 보존한다")
    void usesDifferentProviderResultForTravelMode() {
        String walkJson = """
            { "status": "OK", "route": { "properties": { "totalDistance": 820, "totalTime": 640 } } }
            """;
        String transitJson = """
            { "status": "OK", "routes": [{ "properties": { "totalDistance": 4200, "totalTime": 1080 } }] }
            """;

        KakaoMapClient walkClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> response(walkJson));
        KakaoMapClient transitClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> response(transitJson));

        RouteCandidateService walkService = new RouteCandidateService(stationRepository, walkClient);
        RouteCandidateService transitService = new RouteCandidateService(stationRepository, transitClient);

        RouteCandidateService.StationDistance walkResult = walkService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "WALK"
        ).getFirst();

        RouteCandidateService.StationDistance transitResult = transitService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "TRANSIT"
        ).getFirst();

        assertThat(walkResult.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(walkResult.distanceMeters()).isEqualTo(820);
        assertThat(walkResult.durationSeconds()).isEqualTo(640);
        assertThat(walkResult.routeDetail().distanceMeters()).isEqualTo(820);
        assertThat(walkResult.routeDetail().durationSeconds()).isEqualTo(640);
        assertThat(walkResult.routeDetail().travelMode()).isEqualTo("WALK");

        assertThat(transitResult.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.NORMAL);
        assertThat(transitResult.distanceMeters()).isEqualTo(4200);
        assertThat(transitResult.durationSeconds()).isEqualTo(1080);
        assertThat(transitResult.routeDetail().distanceMeters()).isEqualTo(4200);
        assertThat(transitResult.routeDetail().durationSeconds()).isEqualTo(1080);
        assertThat(transitResult.routeDetail().travelMode()).isEqualTo("TRANSIT");
    }

    @Test
    @DisplayName("후보 하나의 route provider 실패를 UNAVAILABLE로 격리하고 synthetic 거리/시간을 만들지 않는다")
    void providerFailureForOneCandidateKeepsOtherCandidatesWithoutSyntheticFallback() {
        KakaoMapClient failingClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            if (req.uri().toString().contains("126.91062927")) {
                throw new RuntimeException("ST-4 Provider Route Error");
            }
            return response("{\"route\":{\"properties\":{\"totalDistance\":500,\"totalTime\":375}}}");
        });
        RouteCandidateService service = new RouteCandidateService(stationRepository, failingClient);

        List<RouteCandidateService.StationDistance> candidates = service.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5530000"), new BigDecimal("126.9050000"),
            "WALK"
        );

        RouteCandidateService.StationDistance failed = candidates.stream()
            .filter(candidate -> candidate.station().getStationId().equals("ST-4"))
            .findFirst()
            .orElseThrow();

        assertThat(failed.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.UNAVAILABLE);
        assertThat(failed.routeDetail()).isNull();
        assertThat(failed.distanceMeters()).isNull();
        assertThat(failed.durationSeconds()).isNull();
        assertThat(candidates.stream().anyMatch(candidate ->
            candidate.routeStatus() == PredictionApiDtos.RouteStatus.NORMAL)).isTrue();
    }

    @Test
    @DisplayName("PUBLIC_TRANSIT provider 실패를 WALK로 재시도하거나 synthetic duration으로 대체하지 않는다")
    void publicTransitFailureDoesNotFallBackToWalk() {
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<String> requestedUri = new AtomicReference<>();
        KakaoMapClient failingTransitClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            calls.incrementAndGet();
            requestedUri.set(req.uri().toString());
            throw new RuntimeException("transit provider failed");
        });
        RouteCandidateService service = new RouteCandidateService(stationRepository, failingTransitClient);

        RouteCandidateService.StationDistance candidate = service.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "PUBLIC_TRANSIT"
        ).getFirst();

        assertThat(calls.get()).isEqualTo(1);
        assertThat(requestedUri.get()).contains("/publictraffic");
        assertThat(candidate.routeStatus()).isEqualTo(PredictionApiDtos.RouteStatus.UNAVAILABLE);
        assertThat(candidate.routeDetail()).isNull();
        assertThat(candidate.distanceMeters()).isNull();
        assertThat(candidate.durationSeconds()).isNull();
    }

    @SuppressWarnings("unchecked")
    private static java.net.http.HttpResponse<String> response(String body) {
        java.net.http.HttpResponse<String> response = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
        org.mockito.Mockito.when(response.statusCode()).thenReturn(200);
        org.mockito.Mockito.when(response.body()).thenReturn(body);
        return response;
    }
}
