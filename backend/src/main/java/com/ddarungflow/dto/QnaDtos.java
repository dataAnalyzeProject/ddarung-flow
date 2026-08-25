package com.ddarungflow.dto;

import com.ddarungflow.qna.QnaAnswer;
import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaStatus;
import com.ddarungflow.qna.QnaVisibility;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

public class QnaDtos {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AnswerRequest {
        private String content;
        private String answer;

        public String getContent() {
            if (content != null && !content.isBlank()) {
                return content;
            }
            return answer;
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuestionResponse {
        private Long id;
        private Long authorId;
        private String authorName;
        private String title;
        private String content;
        private QnaCategory category;
        private QnaVisibility visibility;
        private QnaStatus status;
        private String secretPin;
        private OffsetDateTime createdAt;
        private OffsetDateTime updatedAt;

        public static QuestionResponse from(QnaQuestion q) {
            if (q == null) return null;
            return QuestionResponse.builder()
                    .id(q.getId())
                    .authorId(q.getAuthorId())
                    .authorName(q.getAuthorName())
                    .title(q.getTitle())
                    .content(q.getContent())
                    .category(q.getCategory())
                    .visibility(q.getVisibility())
                    .status(q.getStatus())
                    .secretPin(q.getSecretPin())
                    .createdAt(q.getCreatedAt())
                    .updatedAt(q.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AnswerResponse {
        private Long id;
        private Long questionId;
        private Long responderId;
        private String responderName;
        private String content;
        private OffsetDateTime createdAt;
        private OffsetDateTime updatedAt;

        public static AnswerResponse from(QnaAnswer a) {
            if (a == null) return null;
            return AnswerResponse.builder()
                    .id(a.getId())
                    .questionId(a.getQuestion() != null ? a.getQuestion().getId() : null)
                    .responderId(a.getResponderId())
                    .responderName(a.getResponderName())
                    .content(a.getContent())
                    .createdAt(a.getCreatedAt())
                    .updatedAt(a.getUpdatedAt())
                    .build();
        }
    }

    public record ErrorResponse(String code, String message) {}
}
