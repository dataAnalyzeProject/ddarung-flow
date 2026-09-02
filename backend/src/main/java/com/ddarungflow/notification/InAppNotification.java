package com.ddarungflow.notification;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(
    name = "in_app_notifications",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_in_app_notification_user_dedup",
            columnNames = {"user_id", "dedup_key"}
        )
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InAppNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "dedup_key", nullable = false, length = 150)
    private String dedupKey;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "notification_type", nullable = false, length = 50)
    private String notificationType;

    @Column(name = "action_type", length = 50)
    private String actionType;

    @Column(name = "action_ref", length = 100)
    private String actionRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }
    }

    @Builder
    public InAppNotification(Long userId, String dedupKey, String title, String message, String notificationType,
                             String actionType, String actionRef, OffsetDateTime readAt) {
        this.userId = userId;
        this.dedupKey = dedupKey;
        this.title = title;
        this.message = message;
        this.notificationType = notificationType;
        this.actionType = actionType;
        this.actionRef = actionRef;
        this.readAt = readAt;
    }

    public void markAsRead(OffsetDateTime readTime) {
        // 최초 readAt 시각을 보존 (이미 readAt이 존재하면 변경하지 않음)
        if (this.readAt == null) {
            this.readAt = readTime != null ? readTime : OffsetDateTime.now();
        }
    }
}
