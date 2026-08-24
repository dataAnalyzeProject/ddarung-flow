package com.ddarungflow.dto;

import com.ddarungflow.qna.QnaAnswer;
import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaStatus;
import com.ddarungflow.qna.QnaVisibility;

import java.time.OffsetDateTime;
import java.util.List;

public final class QnaDtos {
    private QnaDtos() { }

    public record QuestionRequest(String title, String body, QnaCategory category, QnaVisibility visibility) { }
    public record AnswerRequest(String body) { }
    public record QuestionResponse(Long id, String title, String body, QnaCategory category, QnaVisibility visibility,
                                   QnaStatus status, boolean isAuthor, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                                   List<AnswerResponse> answers) { }
    public record AnswerResponse(Long id, String body, OffsetDateTime createdAt) { }
    public record PageResponse(List<QuestionResponse> items, int page, int size, long total) { }
    public record ErrorResponse(String code, String message) { }

    public static QuestionResponse question(QnaQuestion question, boolean isAuthor, List<QnaAnswer> answers) {
        return new QuestionResponse(question.getId(), question.getTitle(), question.getContent(), question.getCategory(),
                question.getVisibility(), question.getStatus(), isAuthor, question.getCreatedAt(), question.getUpdatedAt(),
                answers.stream().map(answer -> new AnswerResponse(answer.getId(), answer.getContent(), answer.getCreatedAt())).toList());
    }
}
