package com.ddarungflow.controller;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@org.springframework.context.annotation.Import(MapControllerTest.TestConfig.class)
class MapControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @org.springframework.boot.test.context.TestConfiguration
    static class TestConfig {
        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        public com.ddarungflow.map.KakaoMapClient kakaoMapClient() {
            String fakeKakaoJson = """
                {
                  "documents": [
                    {
                      "id": "12345",
                      "place_name": "서울역",
                      "address_name": "서울 용산구 한강대로 405",
                      "x": "126.9707",
                      "y": "37.5547"
                    }
                  ]
                }
                """;
            return new com.ddarungflow.map.KakaoMapClient("https://dapi.kakao.com", "fake-key", req -> {
                @SuppressWarnings("unchecked")
                java.net.http.HttpResponse<String> res = org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
                org.mockito.Mockito.when(res.statusCode()).thenReturn(200);
                String uriStr = req.uri().toString();
                if (uriStr.contains("123") || uriStr.contains("%EC%A1%B4%EC%9E%AC")) {
                    org.mockito.Mockito.when(res.body()).thenReturn("{ \"documents\": [] }");
                } else {
                    org.mockito.Mockito.when(res.body()).thenReturn(fakeKakaoJson);
                }
                return res;
            });
        }

        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        public PlaceController placeController(com.ddarungflow.map.KakaoMapClient kakaoMapClient) {
            return new PlaceController(kakaoMapClient);
        }
    }

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private StationInventoryCurrentRepository inventoryRepository;

    @BeforeEach
    void setUp() {
        Station s1 = new Station("ST-4", "00102", "102. 망원역 1번출구 앞", new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true);
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5523000"), new BigDecimal("126.8991000"), true);
        stationRepository.save(s1);
        stationRepository.save(s2);

        inventoryRepository.save(new StationInventoryCurrent("ST-4", 11, OffsetDateTime.now(), InventoryStatus.NORMAL));
        inventoryRepository.save(new StationInventoryCurrent("ST-5", null, OffsetDateTime.now(), InventoryStatus.MISSING));
    }

    // 1. GET /api/v1/stations
    @Test
    @DisplayName("GET /api/v1/stations - 정상: bounds 안의 활성 대여소와 현재 재고 조회")
    @WithMockUser
    void getStationsInBoundsNormal() throws Exception {
        mockMvc.perform(get("/api/v1/stations")
                .param("minLat", "37.5000")
                .param("maxLat", "37.6000")
                .param("minLng", "126.8000")
                .param("maxLng", "127.0000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].stationId").value("ST-4"))
                .andExpect(jsonPath("$[0].availableBikeCount").value(11))
                .andExpect(jsonPath("$[0].inventoryStatus").value("NORMAL"));
    }

    @Test
    @DisplayName("GET /api/v1/stations - 빈결과: 해당 bounds에 대여소가 없는 경우 빈 리스트 반환")
    @WithMockUser
    void getStationsInBoundsEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/stations")
                .param("minLat", "35.0000")
                .param("maxLat", "35.1000")
                .param("minLng", "128.0000")
                .param("maxLng", "128.1000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("GET /api/v1/stations - 잘못된입력: minLat가 maxLat보다 큰 경우 빈 리스트 반환")
    @WithMockUser
    void getStationsInBoundsInvalidMinLatGreaterThanMaxLat() throws Exception {
        mockMvc.perform(get("/api/v1/stations")
                .param("minLat", "38.0000")
                .param("maxLat", "37.0000")
                .param("minLng", "126.8000")
                .param("maxLng", "127.0000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private void prepareTwentyFiveMangwonStations() {
        for (int i = 1; i <= 25; i++) {
            String id = String.format("ST-MW-%02d", i);
            String num = String.format("99%02d", i);
            String name = String.format("망원대여소 %02d호", i);
            stationRepository.save(new Station(id, num, name, new BigDecimal("37.5550"), new BigDecimal("126.9100"), true));
        }
    }

    // 2. GET /api/v1/stations/search
    @Test
    @DisplayName("searchStationsUsesDefaultLimitTen: limit 미지정 시 기본 10개 제한으로 정상 조회된다")
    @WithMockUser
    void searchStationsUsesDefaultLimitTen() throws Exception {
        prepareTwentyFiveMangwonStations();
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10));
    }

    @Test
    @DisplayName("searchStationsHonorsLimitOne: limit=1 지정 시 정확히 1개 결과만 반환한다")
    @WithMockUser
    void searchStationsHonorsLimitOne() throws Exception {
        prepareTwentyFiveMangwonStations();
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원")
                .param("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("비로그인 보호 예측 요청은 인증을 요구한다")
    void protectedPredictionRejectsAnonymous() throws Exception {
        mockMvc.perform(post("/api/v1/predictions/route").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"originLatitude\":37.55,\"originLongitude\":126.9,\"destinationLatitude\":37.56,\"destinationLongitude\":126.91}"))
                .andExpect(status().is3xxRedirection());
    }

    @Test
    @DisplayName("searchStationsHonorsLimitTwenty: limit=20 지정 시 최대 20개 결과를 정확히 반환한다")
    @WithMockUser
    void searchStationsHonorsLimitTwenty() throws Exception {
        prepareTwentyFiveMangwonStations();
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원")
                .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(20));
    }

    @Test
    @DisplayName("searchStationsRejectsLimitBelowOne: limit 1 미만(0) 입력 시 기본 10개 제한으로 보정 처리한다")
    @WithMockUser
    void searchStationsRejectsLimitBelowOne() throws Exception {
        prepareTwentyFiveMangwonStations();
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원")
                .param("limit", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10));
    }

    @Test
    @DisplayName("searchStationsRejectsLimitAboveTwenty: limit 20 초과(30) 입력 시 최대 20개로 제한하여 반환한다")
    @WithMockUser
    void searchStationsRejectsLimitAboveTwenty() throws Exception {
        prepareTwentyFiveMangwonStations();
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원")
                .param("limit", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(20));
    }

    @Test
    @DisplayName("searchStationsAcceptsTwoCharacterQuery: 2자 허용 경계 검색어 입력 시 정상 조회된다")
    @WithMockUser
    void searchStationsAcceptsTwoCharacterQuery() throws Exception {
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망원"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    @DisplayName("searchStationsAcceptsFiftyCharacterQuery: 50자 허용 경계 검색어 입력 시 정상 처리된다")
    @WithMockUser
    void searchStationsAcceptsFiftyCharacterQuery() throws Exception {
        String fiftyCharQuery = "망원".repeat(25); // 50자
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", fiftyCharQuery))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("searchStationsRejectsQueryShorterThanTwo: 2자 미만 검색어 입력 시 빈 리스트를 반환한다")
    @WithMockUser
    void searchStationsRejectsQueryShorterThanTwo() throws Exception {
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "망"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("searchStationsRejectsQueryLongerThanFifty: 50자 초과 검색어 입력 시 50자로 자른 후 정상 처리한다")
    @WithMockUser
    void searchStationsRejectsQueryLongerThanFifty() throws Exception {
        String overFiftyQuery = "망원".repeat(30); // 60자
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", overFiftyQuery))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("GET /api/v1/stations/search - 결과 없음: 검색어 매칭 0건 시 빈 리스트 반환")
    @WithMockUser
    void searchStationsEmptyResult() throws Exception {
        mockMvc.perform(get("/api/v1/stations/search")
                .param("query", "존재하지않는대여소명"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // 3. GET /api/v1/stations/{stationId}
    @Test
    @DisplayName("GET /api/v1/stations/{stationId} - 존재하는 대여소 상세 조회")
    @WithMockUser
    void getStationDetailExisting() throws Exception {
        mockMvc.perform(get("/api/v1/stations/ST-4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stationId").value("ST-4"))
                .andExpect(jsonPath("$.name").value("102. 망원역 1번출구 앞"));
    }

    @Test
    @DisplayName("GET /api/v1/stations/{stationId} - 없는 대여소 조회 시 404 Not Found 반환")
    @WithMockUser
    void getStationDetailNonExistingReturns404() throws Exception {
        mockMvc.perform(get("/api/v1/stations/ST-NON-EXISTING"))
                .andExpect(status().isNotFound());
    }

    // 4. GET /api/v1/places/search
    @Test
    @DisplayName("searchPlacesReturnsFixtureBodyWithoutExternalCall: 정상 장소 검색은 외부 호출 없이 placeId, latitude, longitude 등 fixture 필드까지 완벽히 반환한다")
    @WithMockUser
    void searchPlacesReturnsFixtureBodyWithoutExternalCall() throws Exception {
        mockMvc.perform(get("/api/v1/places/search")
                .param("query", "서울역"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].placeId").value("12345"))
                .andExpect(jsonPath("$[0].name").value("서울역"))
                .andExpect(jsonPath("$[0].address").value("서울 용산구 한강대로 405"))
                .andExpect(jsonPath("$[0].latitude").value(37.5547))
                .andExpect(jsonPath("$[0].longitude").value(126.9707));
    }

    @Test
    @DisplayName("GET /api/v1/places/search - 2자 미만 검색어 입력 시 빈 리스트 반환")
    @WithMockUser
    void searchPlacesUnderTwoCharsReturnsEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/places/search")
                .param("query", "서"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("GET /api/v1/places/search - 결과 없음: 매칭 없는 검색어 입력 시 빈 리스트 반환")
    @WithMockUser
    void searchPlacesEmptyResult() throws Exception {
        mockMvc.perform(get("/api/v1/places/search")
                .param("query", "존재하지않는장소검색어123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // 5. POST /api/v1/routes/candidates
    @Test
    @DisplayName("POST /api/v1/routes/candidates - 정상 요청: 주변 후보 및 경로 조회")
    @WithMockUser
    void getRouteCandidatesNormal() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000,
                "destinationLatitude": 37.5556488,
                "destinationLongitude": 126.91062927,
                "travelMode": "WALK",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/routes/candidates").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].stationId").value("ST-4"));
    }

    @Test
    @DisplayName("routeCandidatesReturnsExactlyFiveSortedCandidatesFromSix: 6개 이상의 후보 중 거리 오름차순으로 정확히 5개로 자른다")
    @WithMockUser
    void routeCandidatesReturnsExactlyFiveSortedCandidatesFromSix() throws Exception {
        for (int i = 10; i <= 15; i++) {
            stationRepository.save(new Station("ST-" + i, "00" + i, "대여소 " + i, new BigDecimal("37.5550"), new BigDecimal("126.910" + i), true));
        }

        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000,
                "destinationLatitude": 37.5550,
                "destinationLongitude": 126.9100,
                "travelMode": "WALK",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/routes/candidates").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    @Test
    @DisplayName("POST /api/v1/routes/candidates - 주변 후보 없음: 1km 외곽 목적지 설정 시 빈 리스트 반환")
    @WithMockUser
    void getRouteCandidatesEmptyNoCandidates() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000,
                "destinationLatitude": 35.0000,
                "destinationLongitude": 128.0000,
                "travelMode": "WALK",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/routes/candidates").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("POST /api/v1/routes/candidates - 필수 좌표 누락 시 400 Bad Request 반환")
    @WithMockUser
    void getRouteCandidatesMissingCoordinatesReturns400() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000
            }
            """;

        mockMvc.perform(post("/api/v1/routes/candidates").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isBadRequest());
    }

    // 6. POST /api/v1/predictions/route
    @Test
    @DisplayName("POST /api/v1/predictions/route - 정상 요청: 후보별 예측 조회")
    @WithMockUser
    void getPredictionsRouteNormal() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000,
                "destinationLatitude": 37.5556488,
                "destinationLongitude": 126.91062927,
                "travelMode": "WALK",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/route").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].predictionStatus").value("MISSING"))
                .andExpect(jsonPath("$[0].availabilityLevel").doesNotExist());
    }

    @Test
    @DisplayName("routePredictionReturnsEmptyWhenNoCandidates: 주변 후보가 0개일 때 예측 결과도 빈 리스트(0개)로 반환한다")
    @WithMockUser
    void routePredictionReturnsEmptyWhenNoCandidates() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000,
                "destinationLatitude": 35.0000,
                "destinationLongitude": 128.0000,
                "travelMode": "WALK",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/route").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("POST /api/v1/predictions/route - 목적지 좌표 누락 시 400 Bad Request 반환")
    @WithMockUser
    void getPredictionsRouteMissingDestinationReturns400() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5500,
                "originLongitude": 126.9000
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/route").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isBadRequest());
    }

    // 7. POST /api/v1/predictions/direct
    @Test
    @DisplayName("POST /api/v1/predictions/direct - 정상 요청: 지정 대여소 및 대체 후보 예측 조회")
    @WithMockUser
    void getPredictionsDirectNormal() throws Exception {
        String jsonPayload = """
            {
                "stationId": "ST-4",
                "originLatitude": 37.5556488,
                "originLongitude": 126.91062927,
                "travelMode": "DIRECT",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/direct").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stationId").value("ST-4"));
    }

    @Test
    @DisplayName("directPredictionReturnsEmptyWhenPrimaryAndAlternativesAreAbsent: 존재하지 않는 대여소이며 주변 후보도 없을 때 빈 리스트(0개)를 반환한다")
    @WithMockUser
    void directPredictionReturnsEmptyWhenPrimaryAndAlternativesAreAbsent() throws Exception {
        String jsonPayload = """
            {
                "stationId": "ST-NON-EXISTING",
                "originLatitude": 35.0000,
                "originLongitude": 128.0000,
                "travelMode": "DIRECT",
                "minutesAhead": 60,
                "requiredBikeCount": 1
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/direct").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("POST /api/v1/predictions/direct - stationId 누락 시 400 Bad Request 반환")
    @WithMockUser
    void getPredictionsDirectMissingStationIdReturns400() throws Exception {
        String jsonPayload = """
            {
                "originLatitude": 37.5556488,
                "originLongitude": 126.91062927
            }
            """;

        mockMvc.perform(post("/api/v1/predictions/direct").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonPayload))
                .andExpect(status().isBadRequest());
    }
}
