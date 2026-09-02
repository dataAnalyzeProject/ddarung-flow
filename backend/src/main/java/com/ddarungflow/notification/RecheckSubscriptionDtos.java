package com.ddarungflow.notification;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public final class RecheckSubscriptionDtos {
    private RecheckSubscriptionDtos() { }

    public record PlaceReference(String providerId, String displayName, BigDecimal latitude, BigDecimal longitude) { }

    public record SearchInput(PlaceReference origin, PlaceReference destination, String travelMode,
                              Integer requiredBikeCount) { }

    public record CreateRequest(String kind, String savedJourneyId, SearchInput searchInput,
                                OffsetDateTime departureAt) { }

    public record SubscriptionResponse(String publicId, String kind, String status, String savedJourneyId,
                                       SearchInput searchInput, OffsetDateTime departureAt,
                                       OffsetDateTime notifyAt, OffsetDateTime createdAt) { }

    public record ExecutionResponse(String kind, Object result) { }

    public record ErrorResponse(String code) { }
}
