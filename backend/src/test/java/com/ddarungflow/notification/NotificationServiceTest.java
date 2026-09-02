package com.ddarungflow.notification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.List;

import com.ddarungflow.entity.Station;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.repository.StationRepository;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private AlertRuleRepository alertRuleRepository;

    @Mock
    private InAppNotificationRepository inAppNotificationRepository;

    @Mock
    private StationRepository stationRepository;

    @InjectMocks
    private NotificationService notificationService;

    @Nested
    @DisplayName("인앱 알림 (InAppNotification) 사용자별 격리, 멱등성 및 읽음 시각 보존 테스트")
    class InAppNotificationTests {

        @Test
        @DisplayName("미읽음 필터는 해당 사용자의 미읽음 알림만 조회한다")
        void getInAppNotifications_UnreadOnly() {
            Long userId = 1L;
            InAppNotification unread = InAppNotification.builder().userId(userId).dedupKey("u").title("제목").message("내용").build();
            given(inAppNotificationRepository.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId)).willReturn(List.of(unread));

            assertThat(notificationService.getInAppNotifications(userId, true)).containsExactly(unread);
        }

        @Test
        @DisplayName("서로 다른 사용자 A, B가 동일한 dedupKey로 요청 시 각자 독립적인 알림이 생성됨")
        void createInAppNotification_DifferentUsersSameDedupKey_CreatesIndependentNotifications() {
            // given
            Long userA = 100L;
            Long userB = 200L;
            String sharedDedupKey = "STATION-ALERT-KEY-01";

            InAppNotification notifA = InAppNotification.builder()
                    .userId(userA)
                    .dedupKey(sharedDedupKey)
                    .title("A 알림")
                    .message("내용 A")
                    .build();

            InAppNotification notifB = InAppNotification.builder()
                    .userId(userB)
                    .dedupKey(sharedDedupKey)
                    .title("B 알림")
                    .message("내용 B")
                    .build();

            given(inAppNotificationRepository.findByUserIdAndDedupKey(userA, sharedDedupKey)).willReturn(Optional.empty());
            given(inAppNotificationRepository.findByUserIdAndDedupKey(userB, sharedDedupKey)).willReturn(Optional.empty());
            given(inAppNotificationRepository.save(any(InAppNotification.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            InAppNotification resultA = notificationService.createInAppNotification(userA, sharedDedupKey, "A 알림", "내용 A");
            InAppNotification resultB = notificationService.createInAppNotification(userB, sharedDedupKey, "B 알림", "내용 B");

            // then
            assertThat(resultA.getUserId()).isEqualTo(userA);
            assertThat(resultB.getUserId()).isEqualTo(userB);
            assertThat(resultA.getDedupKey()).isEqualTo(sharedDedupKey);
            assertThat(resultB.getDedupKey()).isEqualTo(sharedDedupKey);
            assertThat(resultA).isNotEqualTo(resultB);
        }

        @Test
        @DisplayName("동일한 사용자 및 동일한 dedupKey 재요청 시 기존 알림 항목 반환하여 행을 늘리지 않음 (멱등성)")
        void createInAppNotification_DuplicateDedupKey_ReturnsExisting() {
            // given
            Long userId = 1L;
            String dedupKey = "ALERT-STATION-10-20260824";
            InAppNotification existing = InAppNotification.builder()
                    .userId(userId)
                    .dedupKey(dedupKey)
                    .title("대여소 알림")
                    .message("자전거 잔여 5대")
                    .build();

            given(inAppNotificationRepository.findByUserIdAndDedupKey(userId, dedupKey)).willReturn(Optional.of(existing));

            // when
            InAppNotification notification = notificationService.createInAppNotification(userId, dedupKey, "대여소 알림", "자전거 잔여 5대");

            // then
            assertThat(notification).isEqualTo(existing);
            verify(inAppNotificationRepository, never()).save(any());
        }

        @Test
        @DisplayName("구조화 action metadata를 저장하고 기존 null action 알림도 유지한다")
        void createInAppNotification_ActionMetadataIsAdditive() {
            given(inAppNotificationRepository.findByUserIdAndDedupKey(1L, "qna-answered:7"))
                    .willReturn(Optional.empty());
            given(inAppNotificationRepository.save(any(InAppNotification.class)))
                    .willAnswer(invocation -> invocation.getArgument(0));

            InAppNotification created = notificationService.createInAppNotification(1L, "qna-answered:7",
                    "문의 답변", "답변이 등록되었습니다.", "QNA_ANSWERED", "QNA_QUESTION", "7");
            InAppNotification historical = InAppNotification.builder().userId(1L).dedupKey("legacy")
                    .title("과거 알림").message("내용").notificationType("LEGACY").build();

            assertThat(created.getNotificationType()).isEqualTo("QNA_ANSWERED");
            assertThat(created.getActionType()).isEqualTo("QNA_QUESTION");
            assertThat(created.getActionRef()).isEqualTo("7");
            assertThat(historical.getActionType()).isNull();
            assertThat(historical.getActionRef()).isNull();
        }

        @Test
        @DisplayName("알림 읽음 처리 재요청 시 최초 readAt 시각을 보존함")
        void markNotificationAsRead_PreservesInitialReadAt() {
            // given
            Long userId = 1L;
            OffsetDateTime initialReadAt = OffsetDateTime.now().minusHours(2);
            InAppNotification notification = InAppNotification.builder()
                    .userId(userId)
                    .dedupKey("KEY1")
                    .title("알림")
                    .message("내용")
                    .readAt(initialReadAt)
                    .build();

            given(inAppNotificationRepository.findByUserIdAndId(userId, 10L)).willReturn(Optional.of(notification));

            // when
            OffsetDateTime newTime = OffsetDateTime.now();
            InAppNotification result = notificationService.markNotificationAsRead(userId, 10L, newTime);

            // then
            assertThat(result.getReadAt()).isEqualTo(initialReadAt);
        }
    }

    @Nested
    @DisplayName("알림 규칙 (AlertRule) 활성/비활성 테스트")
    class AlertRuleTests {

        @Test
        @DisplayName("비활성화된 알림 규칙 발동 시 알림 생성 거부 예외 발생")
        void triggerNotificationFromRule_DisabledRule_ThrowsException() {
            // given
            Long userId = 1L;
            Long ruleId = 5L;
            AlertRule disabledRule = AlertRule.builder()
                    .userId(userId)
                    .stationId(10L)
                    .conditionType("BIKE_LOW")
                    .threshold(3)
                    .enabled(false)
                    .build();

            given(alertRuleRepository.findByUserIdAndId(userId, ruleId)).willReturn(Optional.of(disabledRule));

            // when & then
            assertThatThrownBy(() -> notificationService.triggerNotificationFromRule(userId, ruleId, "KEY_DEDUP", "제목", "내용"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("비활성화된 알림 규칙");

            verify(inAppNotificationRepository, never()).save(any());
        }

        @Test
        @DisplayName("같은 대여소와 필요 대수 규칙은 기존 항목을 반환한다")
        void createAlertRule_Duplicate_ReturnsExisting() {
            AlertRule existing = AlertRule.builder().userId(1L).stationId(10L).conditionType("ARRIVAL_AVAILABLE_HIGH").threshold(3).enabled(true).build();
            given(alertRuleRepository.findByUserIdAndStationIdAndConditionTypeAndThreshold(1L, 10L, "ARRIVAL_AVAILABLE_HIGH", 3)).willReturn(Optional.of(existing));

            assertThat(notificationService.createAlertRule(1L, 10L, "ignored", 3, true)).isEqualTo(existing);
            verify(alertRuleRepository, never()).save(any(AlertRule.class));
        }

        @Test
        @DisplayName("알림 규칙 20개 이후 새 규칙은 거부한다")
        void createAlertRule_LimitExceeded_ThrowsException() {
            given(alertRuleRepository.findByUserIdAndStationIdAndConditionTypeAndThreshold(1L, 10L, "ARRIVAL_AVAILABLE_HIGH", 3)).willReturn(Optional.empty());
            given(alertRuleRepository.countByUserId(1L)).willReturn(20L);

            assertThatThrownBy(() -> notificationService.createAlertRule(1L, 10L, "ignored", 3, true))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("최대 20개");
        }

        @Test
        @DisplayName("문자열 대여소 ID는 대여소 번호 규칙과 매핑해 HIGH 알림을 만든다")
        void evaluateArrivalRules_MapsStationIdToStationNumber() {
            AlertRule rule = AlertRule.builder().userId(1L).stationId(305L).conditionType("ARRIVAL_AVAILABLE_HIGH").threshold(1).enabled(true).build();
            PredictionApiDtos.CandidatePredictionResponseDto candidate = new PredictionApiDtos.CandidatePredictionResponseDto(
                    "ST-121", "305. 종로구청 옆", BigDecimal.ZERO, BigDecimal.ZERO, 1, 1, 19, null, OffsetDateTime.now(),
                    BigDecimal.ONE, null, 1, OffsetDateTime.now(), OffsetDateTime.now(), 1, 1, OffsetDateTime.now(), OffsetDateTime.now(),
                    PredictionApiDtos.AvailabilityLevel.HIGH, PredictionApiDtos.PredictionStatus.NORMAL, "test", OffsetDateTime.now());
            given(stationRepository.findById("ST-121")).willReturn(Optional.of(new Station("ST-121", "305", "305. 종로구청 옆", BigDecimal.ZERO, BigDecimal.ZERO, true)));
            given(alertRuleRepository.findByUserIdOrderByCreatedAtDesc(1L)).willReturn(List.of(rule));
            given(inAppNotificationRepository.findByUserIdAndDedupKey(any(), any())).willReturn(Optional.empty());
            given(inAppNotificationRepository.save(any(InAppNotification.class))).willAnswer(invocation -> invocation.getArgument(0));

            notificationService.evaluateArrivalRules(1L, candidate);

            verify(inAppNotificationRepository).save(any(InAppNotification.class));
        }
    }
}
