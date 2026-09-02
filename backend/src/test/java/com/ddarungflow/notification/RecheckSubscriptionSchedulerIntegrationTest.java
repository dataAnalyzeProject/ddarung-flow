package com.ddarungflow.notification;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class RecheckSubscriptionSchedulerIntegrationTest {
    @Autowired private RecheckSubscriptionService service;
    @Autowired private RecheckNotificationPublisher publisher;
    @Autowired private RecheckSubscriptionRepository subscriptions;
    @Autowired private InAppNotificationRepository notifications;
    @Autowired private UsersRepository users;

    @BeforeEach
    void clean() {
        notifications.deleteAll();
        subscriptions.deleteAll();
        users.deleteAll();
    }

    @Test
    void persistedRowIsNotDueBeforeNotifyAtThenSchedulerPublishesExactlyOnce() {
        Users user = users.save(user("scheduler-success"));
        OffsetDateTime notifyAt = OffsetDateTime.now().minusSeconds(1);
        RecheckSubscription subscription = subscriptions.saveAndFlush(subscription(user.getId(), notifyAt));

        assertThat(publisher.findDueIds(notifyAt.minusSeconds(1))).isEmpty();
        assertThat(notifications.count()).isZero();

        service.publishDueNotifications();
        service.publishDueNotifications();

        assertThat(notifications.count()).isEqualTo(1L);
        InAppNotification notification = notifications.findAll().getFirst();
        assertThat(notification.getNotificationType()).isEqualTo("SEARCH_RECHECK");
        assertThat(notification.getActionType()).isEqualTo("RECHECK_SUBSCRIPTION");
        assertThat(notification.getActionRef()).isEqualTo(subscription.getPublicId());
        assertThat(subscriptions.findById(subscription.getId()).orElseThrow().getStatus())
                .isEqualTo(RecheckSubscription.Status.DELIVERED);
    }

    private RecheckSubscription subscription(Long userId, OffsetDateTime notifyAt) {
        return new RecheckSubscription("scheduler-public", userId, RecheckSubscription.Kind.SEARCH_RECHECK,
                null, "{}", notifyAt.plusMinutes(15), notifyAt, "scheduler-dedup", OffsetDateTime.now());
    }

    private Users user(String providerUserId) {
        return Users.builder().provider("google").providerUserId(providerUserId)
                .displayName(providerUserId).role(UserRole.USER).build();
    }
}
