package com.ddarungflow.service;

import com.ddarungflow.repository.StationPredictionRepository;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;

class PredictionLookupServiceTest {

    private static final OffsetDateTime REQUESTED_AT =
        OffsetDateTime.of(2026, 8, 10, 10, 30, 0, 0, ZoneOffset.ofHours(9));

    private final StationPredictionRepository repository = mock(StationPredictionRepository.class);
    private final PredictionLookupService service = new PredictionLookupService(repository);

    @Test
    @Disabled("BE-3.2 담당자가 최신 유효 결과 조회를 구현한 뒤 활성화합니다.")
    void returnsLatestActivePredictionGeneratedBeforeRequest() {
        fail("fixture의 두 ACTIVE 배치 중 요청 전에 생성된 최신 featureAsOf 결과를 검증하세요.");
    }

    @Test
    @Disabled("BE-3.2 담당자가 expiresAt 경계를 구현한 뒤 활성화합니다.")
    void excludesPredictionWhenRequestedAtIsNotBeforeExpiresAt() {
        fail("requestedAt < expiresAt일 때만 유효한지 검증하세요.");
    }

    @Test
    @Disabled("BE-3.2 담당자가 누락과 0 확률 구분을 구현한 뒤 활성화합니다.")
    void distinguishesMissingPredictionFromZeroProbability() {
        fail("조회 결과 없음과 selectedProbability 0을 서로 다르게 검증하세요.");
    }
}
