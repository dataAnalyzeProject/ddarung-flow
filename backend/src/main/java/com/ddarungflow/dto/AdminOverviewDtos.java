package com.ddarungflow.dto;
import java.time.OffsetDateTime;
public final class AdminOverviewDtos {
    private AdminOverviewDtos() { }
    public record Response(String serviceStatus, Freshness dataFreshness, ActiveModel activeModel, RecentFailures recentFailures, Pending pending, OffsetDateTime generatedAt) { }
    public record Freshness(OffsetDateTime latestCollectedAt, Long ageMinutes, String status) { }
    public record ActiveModel(String state, String modelVersion, String artifactSha256) { }
    public record RecentFailures(int windowHours, long count) { }
    public record Pending(long exports, long modelApprovals, long qnaUnanswered) { }
}
