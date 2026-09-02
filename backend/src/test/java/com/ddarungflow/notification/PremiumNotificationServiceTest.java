package com.ddarungflow.notification;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.payment.SubscriptionStatus;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PremiumNotificationServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-02T03:00:00Z");
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final PremiumNotificationService service = new PremiumNotificationService(subscriptions, notifications,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void activationUsesStableOneTimeDedupAndSandboxSemantics() throws Exception {
        Subscription subscription = subscription(1L, OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));

        service.notifyActivated(subscription, "order-1");
        service.notifyActivated(subscription, "order-1");

        verify(notifications, times(2)).createInAppNotification(1L, "premium-active:order-1",
                "Premium 샌드박스가 활성화되었습니다", "샌드박스 Premium 기능을 사용할 수 있습니다.",
                "PREMIUM_ACTIVE", "PREMIUM_STATUS", null);
    }

    @Test
    void schedulerCreatesSingleSevenDayExpiryReminder() throws Exception {
        OffsetDateTime start = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).minusDays(24);
        Subscription subscription = subscription(9L, start);
        when(subscriptions.findForStatusNotifications(
                SubscriptionStatus.ACTIVE.name(), OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(7)))
                .thenReturn(List.of(subscription), List.of());

        service.publishStatusNotifications();
        service.publishStatusNotifications();

        verify(notifications).createInAppNotification(1L, "premium-expiry:9",
                "Premium 샌드박스 만료가 다가옵니다", "7일 이내에 샌드박스 Premium 이용 기간이 끝납니다.",
                "PREMIUM_EXPIRY", "PREMIUM_STATUS", null);
        assertThat(subscription.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
    }

    @Test
    void schedulerMarksExpiredAndCreatesDeduplicatedExpiredEvent() throws Exception {
        OffsetDateTime start = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).minusDays(31);
        Subscription subscription = subscription(10L, start);
        when(subscriptions.findForStatusNotifications(
                SubscriptionStatus.ACTIVE.name(), OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(7)))
                .thenReturn(List.of(subscription));

        service.publishStatusNotifications();

        assertThat(subscription.getStatus()).isEqualTo(SubscriptionStatus.EXPIRED);
        verify(notifications).createInAppNotification(1L, "premium-expired:10",
                "Premium 샌드박스가 만료되었습니다", "샌드박스 Premium 상태를 다시 확인해 주세요.",
                "PREMIUM_EXPIRED", "PREMIUM_STATUS", null);
    }

    private Subscription subscription(long subscriptionId, OffsetDateTime start) throws Exception {
        Users user = Users.builder().provider("test").providerUserId("u1")
                .displayName("user").role(UserRole.USER).build();
        user.prePersist();
        setId(user, 1L);
        Subscription subscription = new Subscription(user, SubscriptionPlan.PREMIUM_MONTHLY_30D, start);
        setId(subscription, subscriptionId);
        return subscription;
    }

    private void setId(Object target, long id) throws Exception {
        Field field = target.getClass().getDeclaredField("id");
        field.setAccessible(true);
        field.set(target, id);
    }
}
