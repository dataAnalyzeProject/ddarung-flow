package com.ddarungflow.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "questions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private Users author;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 30)
    private QuestionCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private QuestionVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private QuestionStatus status;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(name = "answer", columnDefinition = "TEXT")
    private String answer;

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
            this.status = QuestionStatus.OPEN;
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
            this.visibility = QuestionVisibility.PRIVATE;
        } else if (this.visibility == null) {
            this.visibility = QuestionVisibility.PUBLIC;
        }
    }

    @Builder
    public Question(
            UUID publicId,
            Users author,
            QuestionCategory category,
            QuestionVisibility visibility,
            QuestionStatus status,
            String title,
            String body,
            String answer,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this.publicId = publicId;
        this.author = author;
        this.category = category;
        this.visibility = visibility;
        this.status = status != null ? status : QuestionStatus.OPEN;
        this.title = title;
        this.body = body;
        this.answer = answer;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        enforcePrivacyRules();
    }

    public void updateContent(QuestionCategory category, QuestionVisibility visibility, String title, String body) {
        if (category != null) {
            this.category = category;
        }
        if (visibility != null) {
            this.visibility = visibility;
        }
        if (title != null && !title.isBlank()) {
            this.title = title;
        }
        if (body != null && !body.isBlank()) {
            this.body = body;
        }
        enforcePrivacyRules();
    }

    public void updateAnswer(String answer, QuestionStatus status) {
        this.answer = answer;
        if (status != null) {
            this.status = status;
        } else {
            this.status = (answer != null && !answer.isBlank()) ? QuestionStatus.ANSWERED : QuestionStatus.OPEN;
        }
    }
}
