package com.ddarungflow.dto;

import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaStatus;
import com.ddarungflow.qna.QnaVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class QnaDtos {

    public record CreateRequest(
            @NotBlank(message = "제목은 필수 입력사항입니다.")
            @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
            String title,

            @NotBlank(message = "내용은 필수 입력사항입니다.")
            @Size(max = 5000, message = "내용은 5000자 이하여야 합니다.")
            String body,

            @NotNull(message = "카테고리는 필수 입력사항입니다.")
            QnaCategory category,

            QnaVisibility visibility
    ) {}

    public record UpdateRequest(
            @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
            String title,

            @Size(max = 5000, message = "내용은 5000자 이하여야 합니다.")
            String body,

            QnaCategory category,

            QnaVisibility visibility
    ) {}

    public record QuestionResponse(
            String id,
            String title,
            String body,
            QnaCategory category,
            QnaVisibility visibility,
            QnaStatus status,
            boolean isAuthor,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        public static QuestionResponse from(QnaQuestion question, UUID currentUserId) {
            boolean isAuthor = currentUserId != null && currentUserId.equals(question.getAuthorUserId());
            return new QuestionResponse(
                    question.getPublicId().toString(),
                    question.getTitle(),
                    question.getBody(),
                    question.getCategory(),
                    question.getVisibility(),
                    question.getStatus(),
                    isAuthor,
                    question.getCreatedAt(),
                    question.getUpdatedAt()
            );
        }
    }

    public record PageResponse<T>(
            List<T> items,
            int page,
            int size,
            long total
    ) {}
}
