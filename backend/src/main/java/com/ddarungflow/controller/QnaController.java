package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.QnaDtos;
import com.ddarungflow.qna.QnaAnswer;
import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaService;
import com.ddarungflow.qna.QnaStatus;
import com.ddarungflow.qna.QnaVisibility;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/qna")
@RequiredArgsConstructor
public class QnaController {

    private final QnaService qnaService;

    @GetMapping(value = {"", "/questions"})
    public ResponseEntity<List<QnaDtos.QuestionResponse>> getQuestions(
            @RequestParam(required = false) QnaCategory category,
            @RequestParam(required = false) QnaStatus status,
            @RequestParam(required = false) QnaVisibility visibility
    ) {
        List<QnaQuestion> questions;
        if (category != null) {
            questions = qnaService.getQuestionsByCategory(category);
        } else if (status != null) {
            questions = qnaService.getQuestionsByStatus(status);
        } else if (visibility != null) {
            questions = qnaService.getQuestionsByVisibility(visibility);
        } else {
            questions = qnaService.getAllQuestions();
        }
        return ResponseEntity.ok(questions.stream().map(QnaDtos.QuestionResponse::from).toList());
    }

    @GetMapping("/questions/{id}")
    public ResponseEntity<QnaDtos.QuestionResponse> getQuestion(@PathVariable Long id) {
        QnaQuestion question = qnaService.getQuestion(id);
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(question));
    }

    @PostMapping(value = {"/questions/{questionId}/answer", "/questions/{questionId}/answers"})
    public ResponseEntity<QnaDtos.AnswerResponse> addAnswer(
            @PathVariable Long questionId,
            @RequestBody(required = false) QnaDtos.AnswerRequest request,
            @AuthenticationPrincipal PrincipalDetails principal
    ) {
        Long responderId = (principal != null && principal.getUsers() != null) ? principal.getUsers().getId() : null;
        String responderName = (principal != null && principal.getUsers() != null && principal.getUsers().getDisplayName() != null)
                ? principal.getUsers().getDisplayName()
                : "관리자";
        String content = request != null ? request.getContent() : null;

        QnaAnswer answer = qnaService.addAnswer(questionId, responderId, responderName, content);
        return ResponseEntity.status(HttpStatus.CREATED).body(QnaDtos.AnswerResponse.from(answer));
    }

    @PostMapping("/questions/{questionId}/hide")
    public ResponseEntity<QnaDtos.QuestionResponse> hideQuestion(@PathVariable Long questionId) {
        QnaQuestion hidden = qnaService.hideQuestion(questionId);
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(hidden));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<QnaDtos.ErrorResponse> handleIllegalArgument(IllegalArgumentException e) {
        String msg = e.getMessage() != null ? e.getMessage() : "잘못된 요청입니다.";
        if (msg.contains("질문을 찾을 수 없습니다")) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new QnaDtos.ErrorResponse("QUESTION_NOT_FOUND", "질문을 찾을 수 없습니다."));
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new QnaDtos.ErrorResponse("INVALID_REQUEST", msg));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<QnaDtos.ErrorResponse> handleIllegalState(IllegalStateException e) {
        String msg = e.getMessage() != null ? e.getMessage() : "요청을 처리할 수 없는 상태입니다.";
        if (msg.contains("이미 답변이 등록된 질문")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new QnaDtos.ErrorResponse("DUPLICATE_ANSWER", "이미 답변이 등록된 질문입니다."));
        }
        if (msg.contains("숨김 처리") || msg.contains("마감된 질문")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new QnaDtos.ErrorResponse("INVALID_QUESTION_STATUS", "숨김 처리되거나 마감된 질문에는 답변을 등록할 수 없습니다."));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new QnaDtos.ErrorResponse("CONFLICT_STATE", msg));
    }
}
