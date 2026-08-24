package com.ddarungflow.qna;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.Objects;

@Entity
@Table(name = "qna_questions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QnaQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "author_id")
    private Long authorId;

    @Column(name = "author_name", length = 100)
    private String authorName;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 50)
    private QnaCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private QnaVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private QnaStatus status;

    @Column(name = "secret_pin", length = 20)
    private String secretPin;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.updatedAt == null) {
            this.updatedAt = now;
        }
        if (this.status == null) {
            this.status = QnaStatus.PENDING;
        }
        if (this.category == null) {
            this.category = QnaCategory.OTHER;
        }
        enforceCategoryVisibilityRules();
    }

    @PreUpdate
    public void preUpdate() {
        enforceCategoryVisibilityRules();
        this.updatedAt = OffsetDateTime.now();
    }

    @Builder
    public QnaQuestion(Long authorId, String authorName, String title, String content,
                       QnaCategory category, QnaVisibility visibility, QnaStatus status, String secretPin) {
        this.authorId = authorId;
        this.authorName = authorName;
        this.title = title;
        this.content = content;
        this.category = category != null ? category : QnaCategory.OTHER;
        this.visibility = visibility != null ? visibility : QnaVisibility.PUBLIC;
        this.status = status != null ? status : QnaStatus.PENDING;
        this.secretPin = secretPin;
        enforceCategoryVisibilityRules();
    }

    public void update(String title, String content, QnaCategory category, QnaVisibility visibility, String secretPin) {
        if (title != null && !title.isBlank()) {
            this.title = title;
        }
        if (content != null && !content.isBlank()) {
            this.content = content;
        }
        if (category != null) {
            this.category = category;
        }
        if (visibility != null) {
            this.visibility = visibility;
        }
        this.secretPin = secretPin;
        enforceCategoryVisibilityRules();
        this.updatedAt = OffsetDateTime.now();
    }

    public void enforceCategoryVisibilityRules() {
        if (this.category == QnaCategory.ACCOUNT || this.category == QnaCategory.LOCATION) {
            this.visibility = QnaVisibility.PRIVATE;
        } else if (this.visibility == null) {
            this.visibility = QnaVisibility.PUBLIC;
        }
    }

    public boolean isAuthor(Long requesterId) {
        if (requesterId == null || this.authorId == null) {
            return false;
        }
        return Objects.equals(this.authorId, requesterId);
    }

    public void changeStatus(QnaStatus newStatus) {
        if (newStatus != null) {
            this.status = newStatus;
            this.updatedAt = OffsetDateTime.now();
        }
    }
}
