package com.ddarungflow.qna;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "qna_questions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QnaQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "author_user_id", nullable = false)
    private UUID authorUserId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 30)
    private QnaCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private QnaVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private QnaStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.publicId == null) {
            this.publicId = UUID.randomUUID();
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.updatedAt == null) {
            this.updatedAt = now;
        }
        if (this.status == null) {
            this.status = QnaStatus.OPEN;
        }
        enforcePrivacyRules();
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = OffsetDateTime.now();
        enforcePrivacyRules();
    }

    public void enforcePrivacyRules() {
        if (this.category != null && this.category.isForcePrivate()) {
            this.visibility = QnaVisibility.PRIVATE;
        } else if (this.visibility == null) {
            this.visibility = QnaVisibility.PUBLIC;
        }
    }

    @Builder
    public QnaQuestion(
            UUID publicId,
            UUID authorUserId,
            String title,
            String body,
            QnaCategory category,
            QnaVisibility visibility,
            QnaStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this.publicId = publicId;
        this.authorUserId = authorUserId;
        this.title = title;
        this.body = body;
        this.category = category;
        this.visibility = visibility;
        this.status = status != null ? status : QnaStatus.OPEN;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        enforcePrivacyRules();
    }

    public void updateByAuthor(String title, String body, QnaCategory category, QnaVisibility visibility) {
        if (title != null && !title.isBlank()) {
            this.title = title;
        }
        if (body != null && !body.isBlank()) {
            this.body = body;
        }
        if (category != null) {
            this.category = category;
        }
        if (visibility != null) {
            this.visibility = visibility;
        }
        enforcePrivacyRules();
    }

    public void markHidden() {
        this.status = QnaStatus.HIDDEN;
    }

    public void updateStatus(QnaStatus status) {
        if (status != null) {
            this.status = status;
        }
    }
}
