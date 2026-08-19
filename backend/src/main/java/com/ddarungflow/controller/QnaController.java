package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.QnaDtos;
import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaStatus;
import com.ddarungflow.qna.QnaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/qna/questions")
@RequiredArgsConstructor
@Tag(name = "QnA", description = "Q&A 질문 API")
public class QnaController {

    private final QnaService qnaService;

    private UUID getActorUserId(Object principal) {
        if (principal instanceof PrincipalDetails details && details.getUsers() != null) {
            return details.getUsers().getPublicId();
        }
        return null;
    }

    @GetMapping
    @Operation(summary = "질문 목록 조회")
    public ResponseEntity<QnaDtos.PageResponse<QnaDtos.QuestionResponse>> getQuestions(
            @RequestParam(required = false, defaultValue = "PUBLIC") String scope,
            @RequestParam(required = false) QnaCategory category,
            @RequestParam(required = false) QnaStatus status,
            @RequestParam(required = false) String query,
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int size,
            @AuthenticationPrincipal Object principal
    ) {
        UUID actorUserId = getActorUserId(principal);
        if ("MINE".equalsIgnoreCase(scope)) {
            return ResponseEntity.ok(qnaService.listMine(actorUserId, category, status, query, page, size));
        } else {
            return ResponseEntity.ok(qnaService.listPublic(category, status, query, page, size, actorUserId));
        }
    }

    @GetMapping("/{id}")
    @Operation(summary = "질문 단건 조회")
    public ResponseEntity<QnaDtos.QuestionResponse> getQuestion(
            @PathVariable UUID id,
            @AuthenticationPrincipal Object principal
    ) {
        UUID actorUserId = getActorUserId(principal);
        QnaQuestion question = qnaService.getForViewer(id, actorUserId);
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(question, actorUserId));
    }

    @PostMapping
    @Operation(summary = "질문 등록")
    public ResponseEntity<QnaDtos.QuestionResponse> createQuestion(
            @Valid @RequestBody QnaDtos.CreateRequest request,
            @AuthenticationPrincipal Object principal
    ) {
        UUID actorUserId = getActorUserId(principal);
        QnaQuestion question = qnaService.create(actorUserId, request.title(), request.body(), request.category(), request.visibility());
        return ResponseEntity.status(HttpStatus.CREATED).body(QnaDtos.QuestionResponse.from(question, actorUserId));
    }

    @PatchMapping("/{id}")
    @Operation(summary = "질문 수정")
    public ResponseEntity<QnaDtos.QuestionResponse> updateQuestion(
            @PathVariable UUID id,
            @Valid @RequestBody QnaDtos.UpdateRequest request,
            @AuthenticationPrincipal Object principal
    ) {
        UUID actorUserId = getActorUserId(principal);
        QnaQuestion question = qnaService.updateByAuthor(id, actorUserId, request.title(), request.body(), request.category(), request.visibility());
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(question, actorUserId));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "질문 삭제")
    public ResponseEntity<Void> deleteQuestion(
            @PathVariable UUID id,
            @AuthenticationPrincipal Object principal
    ) {
        UUID actorUserId = getActorUserId(principal);
        qnaService.deleteByAuthor(id, actorUserId);
        return ResponseEntity.noContent().build();
    }
}
