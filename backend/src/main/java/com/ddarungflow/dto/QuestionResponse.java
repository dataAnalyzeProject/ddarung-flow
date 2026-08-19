package com.ddarungflow.dto;

import com.ddarungflow.entity.Question;
import com.ddarungflow.entity.QuestionCategory;
import com.ddarungflow.entity.QuestionStatus;
import com.ddarungflow.entity.QuestionVisibility;
import lombok.Builder;
import lombok.Getter;

import java.time.OffsetDateTime;

@Getter
@Builder
public class QuestionResponse {
    private String id;
    private QuestionCategory category;
    private String categoryLabel;
    private QuestionVisibility visibility;
    private QuestionStatus status;
    private String title;
    private String body;
    private String answer;
    private String authorId;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static QuestionResponse from(Question question) {
        return QuestionResponse.builder()
                .id(question.getPublicId().toString())
                .category(question.getCategory())
                .categoryLabel(question.getCategory().getLabel())
                .visibility(question.getVisibility())
                .status(question.getStatus())
                .title(question.getTitle())
                .body(question.getBody())
                .answer(question.getAnswer())
                .authorId(question.getAuthor() != null && question.getAuthor().getPublicId() != null
                        ? question.getAuthor().getPublicId().toString()
                        : null)
                .createdAt(question.getCreatedAt())
                .updatedAt(question.getUpdatedAt())
                .build();
    }
}
