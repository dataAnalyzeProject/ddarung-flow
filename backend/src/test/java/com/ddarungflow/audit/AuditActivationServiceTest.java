package com.ddarungflow.audit;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.modelops.ActivationAttempt;
import com.ddarungflow.modelops.ActivationAttemptRepository;
import com.ddarungflow.modelops.ActivationAttemptService;
import com.ddarungflow.modelops.ActivationAttemptStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AuditActivationServiceTest {

    @Mock
    private AuditEventRepository auditEventRepository;

    @InjectMocks
    private AuditEventService auditEventService;

    @Mock
    private ActivationAttemptRepository activationAttemptRepository;

    @InjectMocks
    private ActivationAttemptService activationAttemptService;

    @Nested
    @DisplayName("감사 이벤트 (AuditEvent) 테스트")
    class AuditEventTests {

        @Test
        @DisplayName("성공 및 실패 감사 이벤트 정상 추가")
        void appendEvent_SuccessAndFailure() {
            // given
            given(auditEventRepository.existsByCorrelationIdAndActionAndTargetTypeAndTargetId(any(), any(), any(), any()))
                    .willReturn(false);
            given(auditEventRepository.save(any(AuditEvent.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            AuditEvent successEvent = auditEventService.appendEvent(
                    1L, UserRole.ADMIN, "MODEL_ACTIVATE", "MODEL", "10",
                    AuditResult.SUCCESS, null, "CORR-01", OffsetDateTime.now());

            AuditEvent failureEvent = auditEventService.appendEvent(
                    2L, UserRole.USER, "MODEL_ACTIVATE", "MODEL", "11",
                    AuditResult.FAILURE, "ERR_404", "CORR-02", OffsetDateTime.now());

            // then
            assertThat(successEvent.getResult()).isEqualTo(AuditResult.SUCCESS);
            assertThat(successEvent.getActorRole()).isEqualTo(UserRole.ADMIN);
            assertThat(failureEvent.getResult()).isEqualTo(AuditResult.FAILURE);
            assertThat(failureEvent.getReasonCode()).isEqualTo("ERR_404");
        }

        @Test
        @DisplayName("USER 또는 ADMIN 외 금지된 역할 입력 시 거부 예외 발생")
        void appendEvent_ForbiddenRole_ThrowsException() {
            // when & then
            assertThatThrownBy(() -> auditEventService.appendEvent(
                    1L, null, "ACTION", "TARGET", "1",
                    AuditResult.SUCCESS, null, "CORR-KEY", OffsetDateTime.now()))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("허용되지 않은 감사 입력 역할");

            verify(auditEventRepository, never()).save(any());
        }

        @Test
        @DisplayName("중복 감사키 (correlationId, action, targetType, targetId) 생성 시도 시 거부 예외 발생")
        void appendEvent_DuplicateAuditKey_ThrowsException() {
            // given
            given(auditEventRepository.existsByCorrelationIdAndActionAndTargetTypeAndTargetId(
                    "CORR-01", "ACTIVATE", "MODEL", "10")).willReturn(true);

            // when & then
            assertThatThrownBy(() -> auditEventService.appendEvent(
                    1L, UserRole.ADMIN, "ACTIVATE", "MODEL", "10",
                    AuditResult.SUCCESS, null, "CORR-01", OffsetDateTime.now()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("중복된 감사 이벤트 키");

            verify(auditEventRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("모델 활성화 시도 (ActivationAttempt) 테스트")
    class ActivationAttemptTests {

        @Test
        @DisplayName("최초 활성화 시 previousModelId null 저장 허용 및 STARTED 상태 1회 저장")
        void start_FirstActivation_Success() {
            // given
            given(activationAttemptRepository.existsByCorrelationId("CORR-ACT-01")).willReturn(false);
            given(activationAttemptRepository.save(any(ActivationAttempt.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            ActivationAttempt attempt = activationAttemptService.start(
                    10L, null, 1L, "CORR-ACT-01", OffsetDateTime.now());

            // then
            assertThat(attempt.getCandidateModelId()).isEqualTo(10L);
            assertThat(attempt.getPreviousModelId()).isNull();
            assertThat(attempt.getStatus()).isEqualTo(ActivationAttemptStatus.STARTED);
        }

        @Test
        @DisplayName("중복 correlationId로 start 시도 시 거부 예외 발생")
        void start_DuplicateCorrelationId_ThrowsException() {
            // given
            given(activationAttemptRepository.existsByCorrelationId("CORR-DUP")).willReturn(true);

            // when & then
            assertThatThrownBy(() -> activationAttemptService.start(10L, 5L, 1L, "CORR-DUP", OffsetDateTime.now()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("이미 존재하는 correlationId");

            verify(activationAttemptRepository, never()).save(any());
        }

        @Test
        @DisplayName("STARTED 상태에서 종료 상태(SUCCEEDED)로 전이")
        void finish_FromStartedToSucceeded_Success() {
            // given
            ActivationAttempt attempt = ActivationAttempt.builder()
                    .candidateModelId(10L)
                    .previousModelId(5L)
                    .actorUserId(1L)
                    .status(ActivationAttemptStatus.STARTED)
                    .correlationId("CORR-ACT-02")
                    .startedAt(OffsetDateTime.now().minusMinutes(5))
                    .build();

            given(activationAttemptRepository.findById(1L)).willReturn(Optional.of(attempt));

            // when
            ActivationAttempt finishedAttempt = activationAttemptService.finish(
                    1L, ActivationAttemptStatus.SUCCEEDED, null, OffsetDateTime.now());

            // then
            assertThat(finishedAttempt.getStatus()).isEqualTo(ActivationAttemptStatus.SUCCEEDED);
            assertThat(finishedAttempt.getFinishedAt()).isNotNull();
        }

        @Test
        @DisplayName("종료 상태 완료 후 재전이 시도 시 거부 예외 발생")
        void finish_AfterTerminalStatus_ThrowsException() {
            // given - 이미 SUCCEEDED로 종료된 항목
            ActivationAttempt finishedAttempt = ActivationAttempt.builder()
                    .candidateModelId(10L)
                    .previousModelId(5L)
                    .actorUserId(1L)
                    .status(ActivationAttemptStatus.STARTED)
                    .correlationId("CORR-ACT-03")
                    .startedAt(OffsetDateTime.now().minusMinutes(10))
                    .build();
            finishedAttempt.finish(ActivationAttemptStatus.SUCCEEDED, null, OffsetDateTime.now().minusMinutes(5));

            given(activationAttemptRepository.findById(2L)).willReturn(Optional.of(finishedAttempt));

            // when & then - 이미 종료된 상태에서 FAILED_COMPENSATED로 재전이 시도
            assertThatThrownBy(() -> activationAttemptService.finish(
                    2L, ActivationAttemptStatus.FAILED_COMPENSATED, "ERR", OffsetDateTime.now()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("종료된 활성화 시도");
        }
    }
}
