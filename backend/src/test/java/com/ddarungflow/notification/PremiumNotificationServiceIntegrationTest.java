package com.ddarungflow.notification;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.payment.SubscriptionStatus;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class PremiumNotificationServiceIntegrationTest {
    @Autowired private PremiumNotificationService service;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private InAppNotificationRepository notifications;
    @Autowired private UsersRepository users;

    @BeforeEach
    void clean() {
        notifications.deleteAll();
        subscriptions.deleteAll();
        users.deleteAll();
    }

    @Test
    void activationExpiryAndExpiredEventsArePersistedOnce() {
        Users user = users.save(Users.builder().provider("google").providerUserId("premium-events")
                .displayName("premium-events").role(UserRole.USER).build());
        OffsetDateTime now = OffsetDateTime.now();
        Subscription expiring = subscriptions.save(new Subscription(
                user, SubscriptionPlan.PREMIUM_MONTHLY_30D, now.minusDays(24)));
        Subscription expired = subscriptions.save(new Subscription(
                user, SubscriptionPlan.PREMIUM_MONTHLY_30D, now.minusDays(31)));

        service.notifyActivated(expiring, "sandbox-order");
        service.notifyActivated(expiring, "sandbox-order");
        service.publishStatusNotifications();
        service.publishStatusNotifications();

        List<InAppNotification> events = notifications.findAll();
        assertThat(events).extracting(InAppNotification::getNotificationType)
                .containsExactlyInAnyOrder("PREMIUM_ACTIVE", "PREMIUM_EXPIRY", "PREMIUM_EXPIRED");
        assertThat(events).extracting(InAppNotification::getActionType)
                .containsOnly("PREMIUM_STATUS");
        assertThat(events).extracting(InAppNotification::getActionRef)
                .containsOnlyNulls();
        assertThat(subscriptions.findById(expired.getId()).orElseThrow().getStatus())
                .isEqualTo(SubscriptionStatus.EXPIRED);
    }
}
