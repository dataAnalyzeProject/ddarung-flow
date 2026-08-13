package com.ddarungflow.service;

import com.ddarungflow.dto.PredictionLookupResult;
import com.ddarungflow.repository.StationPredictionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
@Sql("/be-3.2-prediction-fixture.sql")
class PredictionLookupServiceTest {

    private static final OffsetDateTime REQUESTED_AT =
        OffsetDateTime.of(2026, 8, 10, 10, 30, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime TARGET_AT =
        OffsetDateTime.of(2026, 8, 10, 11, 0, 0, 0, ZoneOffset.UTC);
    private static final String STATION_ID = "ST-001";

    @Autowired
    private StationPredictionRepository repository;

    private PredictionLookupService service;

    @BeforeEach
    void setUp() {
        service = new PredictionLookupService(repository);
    }

    @Test
    @DisplayName("요청 전에 생성된 ACTIVE 배치 중 가장 최근 featureAsOf 예측 결과를 반환한다.")
    void returnsLatestActivePredictionGeneratedBeforeRequest() {
        Optional<PredictionLookupResult> result = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);

        // then
        assertThat(result).isPresent();
        PredictionLookupResult res = result.get();
        assertThat(res.batchId()).isEqualTo(UUID.fromString("10000000-0000-0000-0000-000000000005"));
        assertThat(res.modelVersion()).isEqualTo("baseline-v1");
        assertThat(res.generatedAt()).isEqualTo(OffsetDateTime.parse("2026-08-10T10:20:00+09:00"));
        assertThat(res.atLeast1Probability()).isEqualByComparingTo("0.92");
        assertThat(res.atLeast5Probability()).isEqualByComparingTo("0.15");
    }

    @Test
    @DisplayName("requestedAt 이후 생성된 배치는 조회 결과에서 제외된다 (generatedAt <= requestedAt).")
    void excludesBatchesGeneratedAfterRequestedAt() {
        // given: Batch 3 was generated at 10:40:00 (after 10:30:00)
        OffsetDateTime beforeBatch3Generated = OffsetDateTime.of(2026, 8, 10, 10, 30, 0, 0, ZoneOffset.UTC);
        OffsetDateTime afterBatch3Generated = OffsetDateTime.of(2026, 8, 10, 10, 45, 0, 0, ZoneOffset.UTC);

        // when before generatedAt: Batch 5 (featureAsOf 10:00, prob 0.92) is selected instead of Batch 3
        Optional<PredictionLookupResult> resultBefore = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, beforeBatch3Generated);
        assertThat(resultBefore).isPresent();
        assertThat(resultBefore.get().batchId()).isEqualTo(UUID.fromString("10000000-0000-0000-0000-000000000005"));

        // when after generatedAt: Batch 3 (generatedAt 10:40, featureAsOf 10:00) is also candidate,
        // and both Batch 3 and Batch 5 have featureAsOf 10:00, so sorted by generatedAt DESC -> Batch 3 selected
        Optional<PredictionLookupResult> resultAfter = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, afterBatch3Generated);
        assertThat(resultAfter).isPresent();
        assertThat(resultAfter.get().batchId()).isEqualTo(UUID.fromString("10000000-0000-0000-0000-000000000003"));
    }

    @Test
    @DisplayName("ACTIVE가 아닌 배치(STAGING, REJECTED, EXPIRED)는 조회 결과에서 제외된다.")
    void excludesNonActivePublishStatuses() {
        assertThat(service.findLatestValid("ST-STAGING", TARGET_AT, 60, 1, REQUESTED_AT)).isEmpty();
        assertThat(service.findLatestValid("ST-REJECTED", TARGET_AT, 60, 1, REQUESTED_AT)).isEmpty();
        assertThat(service.findLatestValid("ST-EXPIRED-STATUS", TARGET_AT, 60, 1, REQUESTED_AT)).isEmpty();
    }

    @Test
    @DisplayName("requestedAt < expiresAt 조건을 만족하지 않는 배치는 조회 결과에서 제외된다.")
    void excludesPredictionWhenRequestedAtIsNotBeforeExpiresAt() {
        // given: Batch 4 expires at 10:30:00
        OffsetDateTime equalToExpiresAt = OffsetDateTime.of(2026, 8, 10, 10, 30, 0, 0, ZoneOffset.UTC);
        OffsetDateTime afterExpiresAt = OffsetDateTime.of(2026, 8, 10, 10, 31, 0, 0, ZoneOffset.UTC);
        OffsetDateTime beforeExpiresAt = OffsetDateTime.of(2026, 8, 10, 10, 29, 59, 0, ZoneOffset.UTC);

        // equal to expiresAt -> excluded
        assertThat(service.findLatestValid("ST-EXPIRED", TARGET_AT, 120, 1, equalToExpiresAt)).isEmpty();

        // after expiresAt -> excluded
        assertThat(service.findLatestValid("ST-EXPIRED", TARGET_AT, 120, 1, afterExpiresAt)).isEmpty();

        // before expiresAt -> included
        Optional<PredictionLookupResult> validResult = service.findLatestValid("ST-EXPIRED", TARGET_AT, 120, 1, beforeExpiresAt);
        assertThat(validResult).isPresent();
        assertThat(validResult.get().batchId()).isEqualTo(UUID.fromString("10000000-0000-0000-0000-000000000004"));
    }

    @Test
    @DisplayName("조회 결과 없음(Optional.empty)과 확률 0(selectedProbability = 0)을 명확히 구분한다.")
    void distinguishesMissingPredictionFromZeroProbability() {
        // given Case 1: Non-existent stationId
        Optional<PredictionLookupResult> missingResult = service.findLatestValid("ST-9999", TARGET_AT, 60, 1, REQUESTED_AT);
        assertThat(missingResult).isEmpty();

        // given Case 2: Result exists with 0 probability (ST-ZERO)
        Optional<PredictionLookupResult> zeroResult = service.findLatestValid("ST-ZERO", TARGET_AT, 120, 1, REQUESTED_AT);
        assertThat(zeroResult).isPresent();
        assertThat(zeroResult.get().selectedProbability()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("지원하지 않는 horizon 또는 잘못된 자전거 수 요청 시 Optional.empty를 반환한다.")
    void returnsEmptyWhenHorizonOrBikeCountInvalid() {
        Optional<PredictionLookupResult> resultInvalidHorizon = service.findLatestValid(STATION_ID, TARGET_AT, 300, 1, REQUESTED_AT);
        assertThat(resultInvalidHorizon).isEmpty();

        Optional<PredictionLookupResult> resultZeroBike = service.findLatestValid(STATION_ID, TARGET_AT, 60, 0, REQUESTED_AT);
        assertThat(resultZeroBike).isEmpty();

        Optional<PredictionLookupResult> resultSixBike = service.findLatestValid(STATION_ID, TARGET_AT, 60, 6, REQUESTED_AT);
        assertThat(resultSixBike).isEmpty();
    }

    @Test
    @DisplayName("requiredBikeCount 1~5가 각각 atLeast1Probability~atLeast5Probability에 정확히 대응된다.")
    void mapsRequiredBikeCountToCorrespondingProbability() {
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.92");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 2, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.75");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 3, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.55");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 4, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.35");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 5, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.15");
    }

    @Test
    @DisplayName("requiredBikeCount 경계값(1대 및 5대)은 정규 처리되고 경계 외부(0대 및 6대)는 Optional.empty를 반환한다.")
    void handlesBoundaryRequiredBikeCountOneAndFive() {
        // Lower boundary 1
        Optional<PredictionLookupResult> lowerBoundResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);
        assertThat(lowerBoundResult).isPresent();
        assertThat(lowerBoundResult.get().selectedProbability()).isEqualByComparingTo("0.92");

        // Upper boundary 5
        Optional<PredictionLookupResult> upperBoundResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 5, REQUESTED_AT);
        assertThat(upperBoundResult).isPresent();
        assertThat(upperBoundResult.get().selectedProbability()).isEqualByComparingTo("0.15");

        // Outside boundary (< 1 or > 5)
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 0, REQUESTED_AT)).isEmpty();
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 6, REQUESTED_AT)).isEmpty();
    }
}
