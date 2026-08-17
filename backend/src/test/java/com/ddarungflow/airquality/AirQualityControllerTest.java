package com.ddarungflow.airquality;

import com.ddarungflow.entity.Station;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@Import(AirQualityControllerTest.TestConfig.class)
class AirQualityControllerTest {

    private static final String CATALOG_FIXTURE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_CODE" },
            "body": {
              "items": [
                {
                  "stationName": "가까운측정소",
                  "item": "PM10, PM2.5, O3",
                  "dmX": "37.5556488",
                  "dmY": "126.91062927"
                }
              ]
            }
          }
        }
        """;

    private static final String MEASUREMENT_FIXTURE_TEMPLATE = """
        {
          "response": {
            "header": { "resultCode": "00", "resultMsg": "NORMAL_SERVICE" },
            "body": {
              "items": [
                {
                  "stationName": "가까운측정소",
                  "dataTime": "%s",
                  "pm10Value": "8",
                  "pm25Value": "2",
                  "o3Value": "0.035",
                  "khaiValue": "55",
                  "pm10Grade": "1",
                  "pm25Grade": "1",
                  "o3Grade": "2",
                  "khaiGrade": "2"
                }
              ]
            }
          }
        }
        """;

    private static String measurementFixture() {
        ZoneOffset kst = ZoneOffset.ofHours(9);
        String recent = OffsetDateTime.now(kst).minusMinutes(5).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        return MEASUREMENT_FIXTURE_TEMPLATE.formatted(recent);
    }

    @TestConfiguration
    static class TestConfig {
        @Bean
        @Primary
        public AirKoreaClient airKoreaClient(AirKoreaProperties properties) {
            return new AirKoreaClient(properties, req -> {
                String uri = req.uri().toString();
                @SuppressWarnings("unchecked")
                java.net.http.HttpResponse<String> res = Mockito.mock(java.net.http.HttpResponse.class);
                Mockito.when(res.statusCode()).thenReturn(200);
                if (uri.contains("MsrstnInfoInqireSvc")) {
                    Mockito.when(res.body()).thenReturn(CATALOG_FIXTURE);
                } else {
                    Mockito.when(res.body()).thenReturn(measurementFixture());
                }
                return res;
            });
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StationRepository stationRepository;

    @BeforeEach
    void setUp() {
        stationRepository.save(new Station("ST-AIR-1", "00900", "대기질 테스트 대여소",
                new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true));
    }

    @Test
    @DisplayName("GET .../air-quality - 미인증 401")
    void unauthenticatedReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/stations/ST-AIR-1/air-quality"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET .../air-quality - 존재하지 않는 stationId는 404")
    @WithMockUser
    void unknownStationReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/stations/ST-DOES-NOT-EXIST/air-quality"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET .../air-quality - 정상: 세션 있음, 실측 성공 시 CHG-085 DTO 형태로 200 반환")
    @WithMockUser
    void authenticatedKnownStationReturnsNormalizedAirQuality() throws Exception {
        mockMvc.perform(get("/api/v1/stations/ST-AIR-1/air-quality"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stationId").value("ST-AIR-1"))
                .andExpect(jsonPath("$.status").value("NORMAL"))
                .andExpect(jsonPath("$.measurementStation.name").value("가까운측정소"))
                .andExpect(jsonPath("$.measurementStation.distanceMeters").value(0))
                .andExpect(jsonPath("$.pm10.value").value(8.0))
                .andExpect(jsonPath("$.pm10.unit").value("µg/m³"))
                .andExpect(jsonPath("$.pm10.grade").value("GOOD"))
                .andExpect(jsonPath("$.khai.value").value(55.0))
                .andExpect(jsonPath("$.khai.grade").value("MODERATE"));
    }
}
