package com.ddarungflow.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import com.ddarungflow.map.PredictionApiDtos;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationService {
    public static final int MAX_ALERT_RULES = 20;
    public static final String ARRIVAL_AVAILABLE_HIGH = "ARRIVAL_AVAILABLE_HIGH";

    private final AlertRuleRepository alertRuleRepository;
    private final InAppNotificationRepository inAppNotificationRepository;

    @Transactional
    public AlertRule createAlertRule(Long userId, Long stationId, String conditionType, Integer threshold, Boolean enabled) {
        if (userId == null || stationId == null || threshold == null || threshold < 1 || threshold > 5) {
            throw new IllegalArgumentException("필수 알림 규칙 정보가 누락되었습니다.");
        }
        Optional<AlertRule> existing = alertRuleRepository.findByUserIdAndStationIdAndConditionTypeAndThreshold(userId, stationId, ARRIVAL_AVAILABLE_HIGH, threshold);
        if (existing.isPresent()) return existing.get();
        if (alertRuleRepository.countByUserId(userId) >= MAX_ALERT_RULES) throw new IllegalStateException("알림 규칙은 최대 20개까지 저장할 수 있습니다.");

        AlertRule rule = AlertRule.builder()
                .userId(userId)
                .stationId(stationId)
                .conditionType(ARRIVAL_AVAILABLE_HIGH)
                .threshold(threshold)
                .enabled(enabled != null ? enabled : true)
                .build();

        return alertRuleRepository.save(rule);
    }

    public List<AlertRule> getAlertRules(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return alertRuleRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public AlertRule toggleAlertRule(Long userId, Long ruleId, boolean enabled) {
        if (userId == null || ruleId == null) {
            throw new IllegalArgumentException("userId와 ruleId는 필수입니다.");
        }
        AlertRule rule = alertRuleRepository.findByUserIdAndId(userId, ruleId)
                .orElseThrow(NotificationNotFoundException::new);
        rule.updateEnabled(enabled);
        return rule;
    }

    @Transactional
    public InAppNotification createInAppNotification(Long userId, String dedupKey, String title, String message) {
        return createInAppNotification(userId, dedupKey, title, message, "QNA_ANSWERED");
    }
    @Transactional
    public InAppNotification createInAppNotification(Long userId, String dedupKey, String title, String message, String notificationType) {
        if (userId == null || dedupKey == null || dedupKey.isBlank() || title == null || message == null) {
            throw new IllegalArgumentException("필수 알림 정보가 누락되었습니다.");
        }

        // 멱등성: 동일한 사용자 및 동일한 dedupKey 재요청 시 기존 알림 항목 반환 (행을 늘리지 않음)
        Optional<InAppNotification> existing = inAppNotificationRepository.findByUserIdAndDedupKey(userId, dedupKey);
        if (existing.isPresent()) {
            return existing.get();
        }

        InAppNotification notification = InAppNotification.builder()
                .userId(userId)
                .dedupKey(dedupKey)
                .title(title)
                .message(message)
                .notificationType(notificationType)
                .build();

        return inAppNotificationRepository.save(notification);
    }

    @Transactional
    public InAppNotification triggerNotificationFromRule(Long userId, Long ruleId, String dedupKey, String title, String message) {
        if (userId == null || ruleId == null) {
            throw new IllegalArgumentException("userId와 ruleId는 필수입니다.");
        }

        AlertRule rule = alertRuleRepository.findByUserIdAndId(userId, ruleId)
                .orElseThrow(NotificationNotFoundException::new);

        // 비활성 규칙은 인앱 알림을 생성하지 않고 예외 발생
        if (!rule.isEnabled()) {
            throw new IllegalStateException("비활성화된 알림 규칙에서는 알림을 생성할 수 없습니다.");
        }

        return createInAppNotification(userId, dedupKey, title, message, ARRIVAL_AVAILABLE_HIGH);
    }

    @Transactional
    public void evaluateArrivalRules(Long userId, PredictionApiDtos.CandidatePredictionResponseDto candidate) {
        Long stationId = Long.valueOf(candidate.stationId());
        for (AlertRule rule : alertRuleRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
            if (rule.isEnabled() && rule.getStationId().equals(stationId) && rule.getThreshold().equals(candidate.requiredBikeCount())) {
                String key = "arrival-high:" + rule.getId() + ":" + candidate.predictionTargetAt();
                createInAppNotification(userId, key, "도착 시점 대여 가능", candidate.stationName() + "에서 자전거를 빌릴 수 있어요.", ARRIVAL_AVAILABLE_HIGH);
            }
        }
    }

    public List<InAppNotification> getInAppNotifications(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return inAppNotificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public List<InAppNotification> getInAppNotifications(Long userId, boolean unreadOnly) {
        if (userId == null) {
            throw new IllegalArgumentException("userId는 필수입니다.");
        }
        return unreadOnly
                ? inAppNotificationRepository.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId)
                : getInAppNotifications(userId);
    }

    @Transactional
    public InAppNotification markNotificationAsRead(Long userId, Long notificationId, OffsetDateTime readTime) {
        if (userId == null || notificationId == null) {
            throw new IllegalArgumentException("userId와 notificationId는 필수입니다.");
        }

        InAppNotification notification = inAppNotificationRepository.findByUserIdAndId(userId, notificationId)
                .orElseThrow(NotificationNotFoundException::new);

        // markAsRead 내부에서 최초 readAt 시각을 보존함
        notification.markAsRead(readTime != null ? readTime : OffsetDateTime.now());
        return notification;
    }

    @Transactional
    public void markAllNotificationsAsRead(Long userId) {
        getInAppNotifications(userId, true)
                .forEach(notification -> notification.markAsRead(OffsetDateTime.now()));
    }

    public static class NotificationNotFoundException extends RuntimeException {
    }
}
