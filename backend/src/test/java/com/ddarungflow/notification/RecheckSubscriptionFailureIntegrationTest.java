package com.ddarungflow.notification;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.ActiveProfiles;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
class RecheckSubscriptionFailureIntegrationTest {
    @Autowired private RecheckSubscriptionService service;
    @Autowired private RecheckSubscriptionRepository subscriptions;
    @Autowired private UsersRepository users;

    @MockBean private InAppNotificationRepository notifications;

    @BeforeEach
    void clean() {
        subscriptions.deleteAll();
        users.deleteAll();
    }

    @Test
    void notificationTransactionRollbackStillPersistsExplicitFailedStatus() {
        Users user = users.save(user("scheduler-failure"));
        OffsetDateTime notifyAt = OffsetDateTime.now().minusSeconds(1);
        RecheckSubscription subscription = subscriptions.saveAndFlush(new RecheckSubscription(
                "failure-public", user.getId(), RecheckSubscription.Kind.SEARCH_RECHECK, null, "{}",
                notifyAt.plusMinutes(15), notifyAt, "failure-dedup", OffsetDateTime.now()));
        when(notifications.findByUserIdAndDedupKey(any(), any())).thenReturn(Optional.empty());
        when(notifications.save(any())).thenThrow(new DataAccessResourceFailureException("storage unavailable"));

        service.publishDueNotifications();

        assertThat(subscriptions.findById(subscription.getId()).orElseThrow().getStatus())
                .isEqualTo(RecheckSubscription.Status.FAILED);
    }

    private Users user(String providerUserId) {
        return Users.builder().provider("google").providerUserId(providerUserId)
                .displayName(providerUserId).role(UserRole.USER).build();
    }
}
