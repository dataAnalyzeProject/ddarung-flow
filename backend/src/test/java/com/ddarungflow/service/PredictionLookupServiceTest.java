package com.ddarungflow.service;

import com.ddarungflow.dto.PredictionLookupResult;
import com.ddarungflow.entity.PredictionBatch;
import com.ddarungflow.entity.PredictionPublishStatus;
import com.ddarungflow.entity.StationPrediction;
import com.ddarungflow.repository.StationPredictionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class PredictionLookupServiceTest {

    private static final OffsetDateTime REQUESTED_AT =
        OffsetDateTime.of(2026, 8, 10, 10, 30, 0, 0, ZoneOffset.ofHours(9));
    private static final OffsetDateTime TARGET_AT =
        OffsetDateTime.of(2026, 8, 10, 11, 30, 0, 0, ZoneOffset.ofHours(9));
    private static final String STATION_ID = "ST-1001";

    private final StationPredictionRepository repository = mock(StationPredictionRepository.class);
    private final PredictionLookupService service = new PredictionLookupService(repository);

    @Test
    @DisplayName("요청 전에 생성된 ACTIVE 배치 중 가장 최근 featureAsOf 예측 결과를 반환한다.")
    void returnsLatestActivePredictionGeneratedBeforeRequest() {
        // given
        UUID olderBatchId = UUID.randomUUID();
        OffsetDateTime olderFeatureAsOf = REQUESTED_AT.minusHours(1);
        PredictionBatch olderBatch = createBatch(olderBatchId, olderFeatureAsOf, REQUESTED_AT.minusMinutes(30), REQUESTED_AT.plusHours(1));
        StationPrediction olderPrediction = createPrediction(1L, olderBatch, STATION_ID, TARGET_AT, 60, new BigDecimal("0.8500000"));

        UUID newerBatchId = UUID.randomUUID();
        OffsetDateTime newerFeatureAsOf = REQUESTED_AT.minusMinutes(30);
        PredictionBatch newerBatch = createBatch(newerBatchId, newerFeatureAsOf, REQUESTED_AT.minusMinutes(10), REQUESTED_AT.plusHours(1));
        StationPrediction newerPrediction = createPrediction(2L, newerBatch, STATION_ID, TARGET_AT, 60, new BigDecimal("0.9200000"));

        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(List.of(newerPrediction, olderPrediction));

        // when
        Optional<PredictionLookupResult> result = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);

        // then
        assertThat(result).isPresent();
        assertThat(result.get().batchId()).isEqualTo(newerBatchId);
        assertThat(result.get().featureAsOf()).isEqualTo(newerFeatureAsOf);
        assertThat(result.get().selectedProbability()).isEqualByComparingTo(new BigDecimal("0.9200000"));
    }

    @Test
    @DisplayName("requestedAt < expiresAt 조건을 만족하지 않는 배치는 조회 결과에서 제외된다.")
    void excludesPredictionWhenRequestedAtIsNotBeforeExpiresAt() {
        // given
        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(Collections.emptyList());

        // when
        Optional<PredictionLookupResult> result = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("조회 결과 없음(Optional.empty)과 확률 0(selectedProbability = 0)을 명확히 구분한다.")
    void distinguishesMissingPredictionFromZeroProbability() {
        // given Case 1: Result missing
        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(Collections.emptyList());

        // when Case 1
        Optional<PredictionLookupResult> missingResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);

        // then Case 1
        assertThat(missingResult).isEmpty();

        // given Case 2: Result exists with 0 probability
        PredictionBatch batch = createBatch(UUID.randomUUID(), REQUESTED_AT.minusMinutes(30), REQUESTED_AT.minusMinutes(10), REQUESTED_AT.plusHours(1));
        StationPrediction zeroProbPrediction = createPrediction(3L, batch, STATION_ID, TARGET_AT, 60, BigDecimal.ZERO);
        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(List.of(zeroProbPrediction));

        // when Case 2
        Optional<PredictionLookupResult> zeroResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);

        // then Case 2
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

        verifyNoInteractions(repository);
    }

    @Test
    @DisplayName("requiredBikeCount 1~5가 각각 atLeast1Probability~atLeast5Probability에 정확히 대응된다.")
    void mapsRequiredBikeCountToCorrespondingProbability() {
        // given
        PredictionBatch batch = createBatch(UUID.randomUUID(), REQUESTED_AT.minusMinutes(30), REQUESTED_AT.minusMinutes(10), REQUESTED_AT.plusHours(1));
        StationPrediction prediction = new StationPrediction(
            10L, batch, STATION_ID, TARGET_AT, 60,
            new BigDecimal("0.90"),
            new BigDecimal("0.70"),
            new BigDecimal("0.50"),
            new BigDecimal("0.30"),
            new BigDecimal("0.10"),
            "SUCCESS",
            REQUESTED_AT
        );
        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(List.of(prediction));

        // when & then
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.90");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 2, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.70");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 3, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.50");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 4, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.30");
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 5, REQUESTED_AT).get().selectedProbability())
            .isEqualByComparingTo("0.10");
    }

    @Test
    @DisplayName("requiredBikeCount 경계값(1대 및 5대)은 정규 처리되고 경계 외부(0대 및 6대)는 Optional.empty를 반환한다.")
    void handlesBoundaryRequiredBikeCountOneAndFive() {
        // given
        PredictionBatch batch = createBatch(UUID.randomUUID(), REQUESTED_AT.minusMinutes(30), REQUESTED_AT.minusMinutes(10), REQUESTED_AT.plusHours(1));
        StationPrediction prediction = new StationPrediction(
            20L, batch, STATION_ID, TARGET_AT, 60,
            new BigDecimal("0.95"),
            new BigDecimal("0.80"),
            new BigDecimal("0.60"),
            new BigDecimal("0.40"),
            new BigDecimal("0.20"),
            "SUCCESS",
            REQUESTED_AT
        );
        given(repository.findLatestValidCandidates(STATION_ID, TARGET_AT, 60, REQUESTED_AT))
            .willReturn(List.of(prediction));

        // Lower boundary 1
        Optional<PredictionLookupResult> lowerBoundResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 1, REQUESTED_AT);
        assertThat(lowerBoundResult).isPresent();
        assertThat(lowerBoundResult.get().selectedProbability()).isEqualByComparingTo("0.95");

        // Upper boundary 5
        Optional<PredictionLookupResult> upperBoundResult = service.findLatestValid(STATION_ID, TARGET_AT, 60, 5, REQUESTED_AT);
        assertThat(upperBoundResult).isPresent();
        assertThat(upperBoundResult.get().selectedProbability()).isEqualByComparingTo("0.20");

        // Outside boundary (< 1 or > 5)
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 0, REQUESTED_AT)).isEmpty();
        assertThat(service.findLatestValid(STATION_ID, TARGET_AT, 60, 6, REQUESTED_AT)).isEmpty();
    }

    private PredictionBatch createBatch(UUID batchId, OffsetDateTime featureAsOf, OffsetDateTime generatedAt, OffsetDateTime expiresAt) {
        return new PredictionBatch(
            batchId,
            "v1.0.0",
            featureAsOf,
            generatedAt,
            PredictionPublishStatus.ACTIVE,
            generatedAt.plusMinutes(1),
            expiresAt,
            "run-123",
            generatedAt
        );
    }

    private StationPrediction createPrediction(Long id, PredictionBatch batch, String stationId, OffsetDateTime targetAt, int horizon, BigDecimal prob1) {
        return new StationPrediction(
            id,
            batch,
            stationId,
            targetAt,
            horizon,
            prob1,
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            "SUCCESS",
            batch.getGeneratedAt()
        );
    }
}
