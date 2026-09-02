package com.ddarungflow.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class RecheckNotificationPublisher {
    private final RecheckSubscriptionRepository repository;
    private final NotificationService notifications;

    @Transactional
    public List<Long> findDueIds(OffsetDateTime now) {
        return repository.findTop100ByStatusAndNotifyAtLessThanEqualOrderByNotifyAtAsc(
                        RecheckSubscription.Status.ACTIVE, now).stream()
                .map(RecheckSubscription::getId)
                .toList();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void publish(Long subscriptionId) {
        RecheckSubscription subscription = repository.findByIdForUpdate(subscriptionId).orElse(null);
        if (subscription == null || subscription.getStatus() != RecheckSubscription.Status.ACTIVE) return;

        notifications.createInAppNotification(subscription.getUserId(),
                "recheck-due:" + subscription.getPublicId(),
                "출발 전 재확인 시간이 되었습니다",
                "지금 다시 확인해 최신 대여 가능성을 확인하세요.",
                subscription.getKind().name(), "RECHECK_SUBSCRIPTION", subscription.getPublicId());
        subscription.markDelivered();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long subscriptionId) {
        repository.findByIdForUpdate(subscriptionId).ifPresent(RecheckSubscription::markFailed);
    }
}
