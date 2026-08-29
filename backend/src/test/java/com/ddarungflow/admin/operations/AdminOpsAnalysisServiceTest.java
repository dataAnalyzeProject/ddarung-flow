package com.ddarungflow.admin.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import java.time.OffsetDateTime;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminOpsAnalysisServiceTest {
    @Test
    void degradesActiveStationCountFailureToUnavailableWithoutFabricatingCoverage() {
        AdminOpsAnalysisRepository repository = mock(AdminOpsAnalysisRepository.class);
        when(repository.activePublicStationCount()).thenThrow(new DataAccessResourceFailureException("database unavailable"));

        AdminOpsAnalysisDtos.Response response = service(repository).analyze(OffsetDateTime.parse("2026-08-30T00:00:00Z"), "WEEKDAY", "RENTAL");

        assertUnavailable(response, 7);
    }

    @Test
    void degradesProfileQueryFailureToUnavailableWithoutFabricatingCoverage() {
        AdminOpsAnalysisRepository repository = mock(AdminOpsAnalysisRepository.class);
        when(repository.activePublicStationCount()).thenReturn(3L);
        when(repository.findActivePublicProfiles()).thenThrow(new DataAccessResourceFailureException("database unavailable"));

        AdminOpsAnalysisDtos.Response response = service(repository).analyze(OffsetDateTime.parse("2026-08-30T00:00:00Z"), "HOUR", "RENTAL");

        assertUnavailable(response, 24);
    }

    private AdminOpsAnalysisService service(AdminOpsAnalysisRepository repository) {
        return new AdminOpsAnalysisService(repository, new StationRhythmProfileParser(new ObjectMapper()));
    }

    private void assertUnavailable(AdminOpsAnalysisDtos.Response response, int bucketCount) {
        assertThat(response.dataState()).isEqualTo("UNAVAILABLE");
        assertThat(response.ruleVersion()).isEqualTo("OPS_ANALYSIS_STOCKOUT_V1");
        assertThat(response.windowRuleVersion()).isEqualTo("OPS_ANALYSIS_WINDOW_V1");
        assertThat(response.metric()).isEqualTo("OBSERVED_STOCKOUT_RATE");
        assertThat(response.selectedWindowStart()).isNull();
        assertThat(response.selectedWindowEnd()).isNull();
        assertThat(response.selectedWindowProfileCount()).isNull();
        assertThat(response.excludedDifferentWindowProfileCount()).isNull();
        assertThat(response.coverage().activePublicStationCount()).isNull();
        assertThat(response.coverage().profileAvailableCount()).isNull();
        assertThat(response.coverage().selectedWindowProfileCount()).isNull();
        assertThat(response.coverage().parsedProfileCount()).isNull();
        assertThat(response.coverage().usableCellCount()).isNull();
        assertThat(response.coverage().expectedCellCount()).isNull();
        assertThat(response.coverage().profileCoverageRate()).isNull();
        assertThat(response.coverage().cellCoverageRate()).isNull();
        assertThat(response.buckets()).hasSize(bucketCount).allSatisfy(bucket -> {
            assertThat(bucket.sampleCount()).isZero();
            assertThat(bucket.contributingStationCount()).isZero();
            assertThat(bucket.observedStockoutRate()).isNull();
        });
        assertThat(response.weekdayHourCells()).hasSize(168).allSatisfy(cell -> {
            assertThat(cell.sampleCount()).isZero();
            assertThat(cell.contributingStationCount()).isZero();
            assertThat(cell.observedStockoutRate()).isNull();
        });
    }
}
