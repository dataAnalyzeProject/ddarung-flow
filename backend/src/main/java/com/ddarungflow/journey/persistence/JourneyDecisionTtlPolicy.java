package com.ddarungflow.journey.persistence;

import java.time.Duration;
import java.time.OffsetDateTime;

public final class JourneyDecisionTtlPolicy {

    public static final Duration DEFAULT_TTL = Duration.ofHours(24);
    public static final Duration MAX_TTL = Duration.ofHours(24);

    private JourneyDecisionTtlPolicy() { }

    public static OffsetDateTime defaultExpiresAt(OffsetDateTime generatedAt) {
        if (generatedAt == null) throw new IllegalArgumentException("Journey 생성 시각이 필요합니다.");
        return generatedAt.plus(DEFAULT_TTL);
    }

    public static boolean isWithinMaximum(OffsetDateTime generatedAt, OffsetDateTime expiresAt) {
        return generatedAt != null && expiresAt != null && expiresAt.isAfter(generatedAt)
                && Duration.between(generatedAt, expiresAt).compareTo(MAX_TTL) <= 0;
    }
}
