package com.ddarungflow.journey.application;

import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.PredictionApiDtos;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CoreRentalPredictionAdapterTest {

    @Test
    void delegatesToTheCoreJourneyBoundaryWithoutChangingCalculatedTimeFields() {
        MapPredictionService core = mock(MapPredictionService.class);
        java.time.OffsetDateTime coreNow = java.time.OffsetDateTime.parse("2026-08-30T09:00:00+09:00");
        java.time.OffsetDateTime journeyArrivalAt = java.time.OffsetDateTime.parse("2026-08-30T10:30:00+09:00");
        when(core.buildJourneyRouteCandidates(any(), any(), any(), any(), any(), eq(4))).thenReturn(List.of(
                new PredictionApiDtos.CandidatePredictionResponseDto("station-1", "대여소 1", new BigDecimal("37.55"),
                        new BigDecimal("127.05"), 840, 420, 9, InventoryStatus.NORMAL, coreNow.minusMinutes(1),
                        new BigDecimal("0.82"), null, 4, journeyArrivalAt, coreNow.plusHours(1), 60, 60,
                        coreNow, null, PredictionApiDtos.AvailabilityLevel.HIGH, PredictionApiDtos.PredictionStatus.NORMAL,
                        "model@1", coreNow, null)));
        CoreRentalPredictionAdapter adapter = new CoreRentalPredictionAdapter(core);
        java.time.OffsetDateTime departureAt = java.time.OffsetDateTime.parse("2026-08-30T10:23:00+09:00");

        List<JourneyRentalPredictionPort.RentalCandidate> result = adapter.predict(new JourneyRentalPredictionPort.RentalPredictionRequest(
                new BigDecimal("37.54"), new BigDecimal("127.04"), new BigDecimal("37.55"), new BigDecimal("127.05"), departureAt, 4));

        assertThat(result).singleElement().satisfies(candidate -> {
            assertThat(candidate.rentalProbability()).isEqualByComparingTo("0.82");
            assertThat(candidate.requiredBikeCount()).isEqualTo(4);
            assertThat(candidate.arrivalAt()).isEqualTo(journeyArrivalAt);
            assertThat(candidate.predictionTargetAt()).isEqualTo(coreNow.plusHours(1));
            assertThat(candidate.featureAsOf()).isEqualTo(coreNow);
            assertThat(candidate.durationSeconds()).isEqualTo(420);
            assertThat(candidate.predictionStatus()).isEqualTo("NORMAL");
        });
        verify(core).buildJourneyRouteCandidates(new BigDecimal("37.54"), new BigDecimal("127.04"),
                new BigDecimal("37.55"), new BigDecimal("127.05"), departureAt, 4);
    }
}
