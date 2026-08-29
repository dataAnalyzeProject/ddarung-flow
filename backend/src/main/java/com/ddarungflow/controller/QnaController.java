package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.QnaDtos;
import com.ddarungflow.qna.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class QnaController {
    private final QnaService qnaService;

    @GetMapping("/qna/questions")
    public QnaDtos.PageResponse list(@AuthenticationPrincipal PrincipalDetails principal, @RequestParam(defaultValue = "PUBLIC") String scope,
            @RequestParam(required = false) String query, @RequestParam(required = false) QnaCategory category,
            @RequestParam(required = false) QnaStatus status, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        long actorId = principal.getUsers().getId();
        List<QnaQuestion> questions = "MINE".equals(scope) ? qnaService.listMine(actorId, query, category, status) : qnaService.listPublic(query, category, status);
        int safeSize = Math.max(1, Math.min(size, 100)); int from = Math.min(Math.max(0, page) * safeSize, questions.size()); int to = Math.min(from + safeSize, questions.size());
        return new QnaDtos.PageResponse(questions.subList(from, to).stream().map(q -> response(q, actorId)).toList(), page, safeSize, questions.size());
    }

    @PostMapping("/qna/questions")
    public ResponseEntity<QnaDtos.QuestionResponse> create(@AuthenticationPrincipal PrincipalDetails principal, @RequestBody QnaDtos.QuestionRequest request) {
        QnaQuestion saved = qnaService.createQuestion(QnaQuestion.builder().authorId(principal.getUsers().getId()).authorName(principal.getUsers().getDisplayName()).title(request.title()).content(request.body()).category(request.category()).visibility(request.visibility()).build());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(saved, principal.getUsers().getId()));
    }

    @GetMapping("/qna/questions/{id}") public QnaDtos.QuestionResponse get(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) { return response(qnaService.getQuestionForViewer(id, principal.getUsers().getId(), false), principal.getUsers().getId()); }
    @PatchMapping("/qna/questions/{id}") public QnaDtos.QuestionResponse update(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id, @RequestBody QnaDtos.QuestionRequest request) { return response(qnaService.updateQuestion(id, principal.getUsers().getId(), request.title(), request.body(), request.category(), request.visibility(), null), principal.getUsers().getId()); }
    @DeleteMapping("/qna/questions/{id}") public ResponseEntity<Void> delete(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) { qnaService.deleteQuestion(id, principal.getUsers().getId()); return ResponseEntity.noContent().build(); }

    @GetMapping("/admin/qna/questions") @PreAuthorize("hasAuthority('QNA_READ')") public QnaDtos.PageResponse adminList(@AuthenticationPrincipal PrincipalDetails principal) { List<QnaQuestion> questions = qnaService.getAllQuestions(); return new QnaDtos.PageResponse(questions.stream().map(q -> response(q, principal.getUsers().getId())).toList(), 0, questions.size(), questions.size()); }
    @PostMapping("/admin/qna/questions/{id}/answer") @PreAuthorize("hasAuthority('QNA_ANSWER')") public QnaDtos.QuestionResponse answer(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id, @RequestBody QnaDtos.AnswerRequest request) { qnaService.addAnswer(id, principal.getUsers().getId(), principal.getUsers().getDisplayName(), request.body()); return response(qnaService.getQuestion(id), principal.getUsers().getId()); }
    @PostMapping("/admin/qna/questions/{id}/hide") @PreAuthorize("hasAuthority('QNA_HIDE')") public QnaDtos.QuestionResponse hide(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) { return response(qnaService.hideQuestion(id), principal.getUsers().getId()); }

    @ExceptionHandler({IllegalArgumentException.class, SecurityException.class, IllegalStateException.class})
    ResponseEntity<QnaDtos.ErrorResponse> errors(RuntimeException error) { HttpStatus status = error instanceof SecurityException ? HttpStatus.FORBIDDEN : error instanceof IllegalStateException ? HttpStatus.CONFLICT : error.getMessage() != null && error.getMessage().startsWith("QNA_NOT_FOUND") ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST; String code = status == HttpStatus.NOT_FOUND ? "QNA_NOT_FOUND" : status == HttpStatus.CONFLICT ? "QNA_CONFLICT" : status == HttpStatus.FORBIDDEN ? "QNA_ACCESS_DENIED" : "QNA_INVALID_REQUEST"; return ResponseEntity.status(status).body(new QnaDtos.ErrorResponse(code, error.getMessage())); }
    private QnaDtos.QuestionResponse response(QnaQuestion question, long actorId) { return QnaDtos.question(question, question.isAuthor(actorId), qnaService.getAnswersByQuestionId(question.getId())); }
}
