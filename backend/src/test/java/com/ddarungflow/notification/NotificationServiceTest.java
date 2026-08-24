package com.ddarungflow.notification;

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
class NotificationServiceTest {

    @Mock
    private AlertRuleRepository alertRuleRepository;

    @Mock
    private InAppNotificationRepository inAppNotificationRepository;

    @InjectMocks
    private NotificationService notificationService;

    @Nested
    @DisplayName("인앱 알림 (InAppNotification) 사용자별 격리, 멱등성 및 읽음 시각 보존 테스트")
    class InAppNotificationTests {

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
    }
}
