package com.ddarungflow.modelops.retention;

import com.ddarungflow.modelops.ModelArtifactState;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class ArtifactPurgePolicy {

    public static final Duration REJECTED_RETENTION = Duration.ofDays(30);
    public static final Duration RETIRED_RETENTION = Duration.ofDays(90);

    private static final Set<ModelArtifactState> EXCLUDED_STATES = Set.of(
            ModelArtifactState.ACTIVE,
            ModelArtifactState.DRAFT,
            ModelArtifactState.VALIDATED,
            ModelArtifactState.APPROVED
    );

    private final PurgeMarkRepository purgeMarkRepository;

    public boolean isExcludedState(ModelArtifactState state) {
        if (state == null) {
            return false;
        }
        return EXCLUDED_STATES.contains(state);
    }

    public Duration getRetentionPeriod(ModelArtifactState state) {
        if (state == null || isExcludedState(state)) {
            return null;
        }
        return switch (state) {
            case REJECTED -> REJECTED_RETENTION;
            case RETIRED -> RETIRED_RETENTION;
            default -> null;
        };
    }

    public boolean isPurgeCandidate(ModelArtifactState state, OffsetDateTime stateEnteredAt, OffsetDateTime now) {
        if (state == null || stateEnteredAt == null || now == null) {
            return false;
        }
        if (isExcludedState(state)) {
            return false;
        }
        Duration retention = getRetentionPeriod(state);
        if (retention == null) {
            return false;
        }

        OffsetDateTime purgeThreshold = stateEnteredAt.plus(retention);
        return !now.isBefore(purgeThreshold);
    }

    @Transactional
    public Optional<PurgeMark> markPurgePending(
            Long artifactId,
            ModelArtifactState state,
            OffsetDateTime stateEnteredAt,
            OffsetDateTime now
    ) {
        if (artifactId == null) {
            throw new IllegalArgumentException("artifactId는 필수입니다.");
        }
        if (state == null) {
            throw new IllegalArgumentException("state는 필수입니다.");
        }
        if (stateEnteredAt == null) {
            throw new IllegalArgumentException("stateEnteredAt은 필수입니다.");
        }

        OffsetDateTime evalTime = now != null ? now : OffsetDateTime.now();

        if (!isPurgeCandidate(state, stateEnteredAt, evalTime)) {
            return Optional.empty();
        }

        // 멱등성 보장: 이미 마킹된 경우 기존 마크를 반환하고 중복 행을 생성하지 않음
        Optional<PurgeMark> existing = purgeMarkRepository.findByArtifactId(artifactId);
        if (existing.isPresent()) {
            return existing;
        }

        String reason = String.format("%s 상태 보관 기한(%s) 경과에 따른 삭제 예정 마킹", state, getRetentionPeriod(state));
        PurgeMark mark = PurgeMark.builder()
                .artifactId(artifactId)
                .state(state)
                .markedAt(evalTime)
                .reason(reason)
                .build();

        return Optional.of(purgeMarkRepository.save(mark));
    }

    @Transactional
    public Optional<PurgeMark> markForPurge(
            Long artifactId,
            ModelArtifactState state,
            OffsetDateTime stateEnteredAt,
            OffsetDateTime now
    ) {
        return markPurgePending(artifactId, state, stateEnteredAt, now);
    }
}
