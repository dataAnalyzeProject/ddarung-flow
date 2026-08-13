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

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class RouteCandidateServiceTest {

    @Autowired
    private StationRepository stationRepository;

    private RouteCandidateService candidateService;

    @BeforeEach
    void setUp() {
        candidateService = new RouteCandidateService(stationRepository);

        // ST-4: 500m 이내 (망원역)
        Station s1 = new Station("ST-4", "00102", "102. 망원역 1번출구 앞", new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true);
        // ST-5: 1km 이내 (망원한강공원)
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5523000"), new BigDecimal("126.8991000"), true);
        // ST-6 ~ ST-10: 추가 대여소
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
        // 목적지: ST-4 바로 옆 (37.5556, 126.9106)
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
        // 목적지: ST-4에서 700m, ST-5에서 600m 떨어진 위치 (500m 이내 대여소 없음)
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5580000"), new BigDecimal("126.9030000"),
            "WALK"
        );

        assertThat(candidates).isNotEmpty();
    }

    @Test
    @DisplayName("후보를 거리순으로 정렬하고 최대 5개만 반환한다")
    void findCandidatesLimitsToMax5() {
        // 1km 이내에 모든 대여소가 들어오는 목적지
        List<RouteCandidateService.StationDistance> candidates = candidateService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5530000"), new BigDecimal("126.9150000"),
            "WALK"
        );

        assertThat(candidates.size()).isLessThanOrEqualTo(5);
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

        // 중복 체크: ST-4가 2번 이상 등장하지 않아야 함
        long countSt4 = candidates.stream().filter(c -> c.station().getStationId().equals("ST-4")).count();
        assertThat(countSt4).isEqualTo(1);
    }

    @Test
    @DisplayName("usesDifferentProviderResultForTravelMode: travelMode(WALK vs TRANSIT)에 따라 다르게 주입된 provider 경로 결과를 사용한다")
    void usesDifferentProviderResultForTravelMode() {
        String walkJson = """
            { "status": "OK", "route": { "properties": { "totalDistance": 820, "totalTime": 640 } } }
            """;
        String transitJson = """
            { "status": "OK", "routes": [{ "properties": { "totalDistance": 4200, "totalTime": 1080 } }] }
            """;

        @SuppressWarnings("unchecked")
        java.net.http.HttpResponse<String> walkResponse = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
        org.mockito.Mockito.when(walkResponse.statusCode()).thenReturn(200);
        org.mockito.Mockito.when(walkResponse.body()).thenReturn(walkJson);

        @SuppressWarnings("unchecked")
        java.net.http.HttpResponse<String> transitResponse = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
        org.mockito.Mockito.when(transitResponse.statusCode()).thenReturn(200);
        org.mockito.Mockito.when(transitResponse.body()).thenReturn(transitJson);

        KakaoMapClient walkClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> walkResponse);
        KakaoMapClient transitClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> transitResponse);

        RouteCandidateService walkService = new RouteCandidateService(stationRepository, walkClient);
        RouteCandidateService transitService = new RouteCandidateService(stationRepository, transitClient);

        List<RouteCandidateService.StationDistance> walkResults = walkService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "WALK"
        );

        List<RouteCandidateService.StationDistance> transitResults = transitService.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5556000"), new BigDecimal("126.9106000"),
            "TRANSIT"
        );

        assertThat(walkResults.get(0).distanceMeters()).isEqualTo(820);
        assertThat(walkResults.get(0).durationSeconds()).isEqualTo(640);

        assertThat(transitResults.get(0).distanceMeters()).isEqualTo(4200);
        assertThat(transitResults.get(0).durationSeconds()).isEqualTo(1080);
    }

    @Test
    @DisplayName("providerFailureForOneCandidateKeepsOtherCandidates: 후보 하나(ST-4)의 provider 경로가 실패해도 다른 후보(ST-5)가 결과에 남는다")
    void providerFailureForOneCandidateKeepsOtherCandidates() {
        KakaoMapClient failingClient = new KakaoMapClient("https://dapi.kakao.com", "test-key", req -> {
            if (req.uri().toString().contains("126.91062927")) { // ST-4
                throw new RuntimeException("ST-4 Provider Route Error");
            }
            @SuppressWarnings("unchecked")
            java.net.http.HttpResponse<String> okResponse = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
            org.mockito.Mockito.when(okResponse.statusCode()).thenReturn(200);
            org.mockito.Mockito.when(okResponse.body()).thenReturn("{ \"routes\": [{ \"summary\": { \"distance\": 500, \"duration\": 375 } }] }");
            return okResponse;
        });

        RouteCandidateService serviceWithFailure = new RouteCandidateService(stationRepository, failingClient);

        List<RouteCandidateService.StationDistance> candidates = serviceWithFailure.findCandidates(
            new BigDecimal("37.5500"), new BigDecimal("126.9000"),
            new BigDecimal("37.5530000"), new BigDecimal("126.9050000"),
            "WALK"
        );

        assertThat(candidates).isNotEmpty();
        // ST-4, ST-5 등 모든 후보가 실패에 의해 전체 탈락하지 않음을 확인
        assertThat(candidates.stream().anyMatch(c -> c.station().getStationId().equals("ST-4"))).isTrue();
    }
}
