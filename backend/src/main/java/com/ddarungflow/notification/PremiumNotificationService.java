package com.ddarungflow.notification;

import com.ddarungflow.payment.Subscription;
import com.ddarungflow.payment.SubscriptionRepository;
import com.ddarungflow.payment.SubscriptionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class PremiumNotificationService {
    private final SubscriptionRepository subscriptions;
    private final NotificationService notifications;
    private final Clock clock;

    @Autowired
    public PremiumNotificationService(SubscriptionRepository subscriptions, NotificationService notifications) {
        this(subscriptions, notifications, Clock.systemDefaultZone());
    }

    PremiumNotificationService(SubscriptionRepository subscriptions, NotificationService notifications, Clock clock) {
        this.subscriptions = subscriptions;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional
    public void notifyActivated(Subscription subscription, String activationReference) {
        notifications.createInAppNotification(subscription.getUser().getId(),
                "premium-active:" + activationReference,
                "Premium 샌드박스가 활성화되었습니다",
                "샌드박스 Premium 기능을 사용할 수 있습니다.",
                "PREMIUM_ACTIVE", "PREMIUM_STATUS", null);
    }

    @Transactional
    public void notifyExpired(Subscription subscription) {
        notifications.createInAppNotification(subscription.getUser().getId(),
                "premium-expired:" + subscription.getId(),
                "Premium 샌드박스가 만료되었습니다",
                "샌드박스 Premium 상태를 다시 확인해 주세요.",
                "PREMIUM_EXPIRED", "PREMIUM_STATUS", null);
    }

    @Scheduled(
            fixedDelayString = "${notifications.premium.fixed-delay-ms:3600000}",
            initialDelayString = "${notifications.premium.initial-delay-ms:60000}"
    )
    @Transactional
    public void publishStatusNotifications() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        List<Subscription> expiring = subscriptions
                .findForStatusNotifications(SubscriptionStatus.ACTIVE.name(), now.plusDays(7));
        for (Subscription subscription : expiring) {
            if (!subscription.getEndsAt().isAfter(now)) {
                subscription.expire();
                notifyExpired(subscription);
            } else {
                notifications.createInAppNotification(subscription.getUser().getId(),
                        "premium-expiry:" + subscription.getId(),
                        "Premium 샌드박스 만료가 다가옵니다",
                        "7일 이내에 샌드박스 Premium 이용 기간이 끝납니다.",
                        "PREMIUM_EXPIRY", "PREMIUM_STATUS", null);
            }
        }
    }
}
