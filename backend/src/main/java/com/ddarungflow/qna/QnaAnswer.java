package com.ddarungflow.qna;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "qna_answers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QnaAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private QnaQuestion question;

    @Column(name = "responder_id")
    private Long responderId;

    @Column(name = "responder_name", length = 100)
    private String responderName;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

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
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    @Builder
    public QnaAnswer(QnaQuestion question, Long responderId, String responderName, String content) {
        this.question = question;
        this.responderId = responderId;
        this.responderName = responderName;
        this.content = content;
    }

    public void updateContent(String newContent) {
        if (newContent != null && !newContent.isBlank()) {
            this.content = newContent;
            this.updatedAt = OffsetDateTime.now();
        }
    }
}
