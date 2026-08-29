package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class AdminOpsAnalysisDtos {
    private AdminOpsAnalysisDtos() { }
    public record Bucket(int key, long sampleCount, long contributingStationCount, BigDecimal observedStockoutRate) { }
    public record WeekdayHourCell(int dayOfWeek, int hourOfDay, long sampleCount, long contributingStationCount, BigDecimal observedStockoutRate) { }
    public record Coverage(Long activePublicStationCount, Long profileAvailableCount, Long selectedWindowProfileCount, Long parsedProfileCount,
                           Long usableCellCount, Long expectedCellCount, BigDecimal profileCoverageRate, BigDecimal cellCoverageRate) { }
    public record Response(OffsetDateTime referenceTime, OffsetDateTime generatedAt, String view, String riskType, String ruleVersion, String windowRuleVersion, String metric,
                           AdminOpsDtos.Capabilities capabilities, String dataState, Coverage coverage, List<String> limitations,
                           LocalDate selectedWindowStart, LocalDate selectedWindowEnd, Long selectedWindowProfileCount,
                           Long excludedDifferentWindowProfileCount, List<Bucket> buckets, List<WeekdayHourCell> weekdayHourCells) { }
}
