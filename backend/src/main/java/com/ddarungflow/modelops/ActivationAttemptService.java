package com.ddarungflow.modelops;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActivationAttemptService {

    private final ActivationAttemptRepository activationAttemptRepository;

    @Transactional
    public ActivationAttempt start(Long candidateModelId, Long previousModelId, Long actorUserId,
                                   String correlationId, OffsetDateTime now) {
        if (candidateModelId == null || actorUserId == null || correlationId == null || correlationId.isBlank()) {
            throw new IllegalArgumentException("필수 모델 활성화 시작 정보가 누락되었습니다.");
        }

        // 중복 correlationId 거부
        if (activationAttemptRepository.existsByCorrelationId(correlationId)) {
            throw new IllegalStateException("이미 존재하는 correlationId 입니다: " + correlationId);
        }

        ActivationAttempt attempt = ActivationAttempt.builder()
                .candidateModelId(candidateModelId)
                .previousModelId(previousModelId) // 최초 활성화 시 null 가능
                .actorUserId(actorUserId)
                .status(ActivationAttemptStatus.STARTED)
                .correlationId(correlationId)
                .startedAt(now != null ? now : OffsetDateTime.now())
                .build();

        return activationAttemptRepository.save(attempt);
    }

    @Transactional
    public ActivationAttempt finish(Long attemptId, ActivationAttemptStatus targetStatus,
                                    String failureReasonCode, OffsetDateTime now) {
        if (attemptId == null) {
            throw new IllegalArgumentException("attemptId는 필수입니다.");
        }

        ActivationAttempt attempt = activationAttemptRepository.findById(attemptId)
                .orElseThrow(() -> new IllegalArgumentException("해당 활성화 시도 항목을 찾을 수 없습니다: " + attemptId));

        // finish 내부에서 STARTED -> 종료 상태 1회 전이 및 종료 후 재전이 거부 로직 수행
        attempt.finish(targetStatus, failureReasonCode, now);
        return attempt;
    }

    public ActivationAttempt getByCorrelationId(String correlationId) {
        if (correlationId == null || correlationId.isBlank()) {
            throw new IllegalArgumentException("correlationId는 필수입니다.");
        }
        return activationAttemptRepository.findByCorrelationId(correlationId)
                .orElseThrow(() -> new IllegalArgumentException("해당 correlationId의 활성화 시도를 찾을 수 없습니다: " + correlationId));
    }
}
