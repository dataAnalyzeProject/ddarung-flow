package com.ddarungflow.qna.controller;

import com.ddarungflow.qna.*;
import com.ddarungflow.qna.dto.QnaDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import com.ddarungflow.qna.QnaService.QnaException;

@RestController
@RequestMapping("/api/v1/qna/questions")
@RequiredArgsConstructor
public class QnaController {

    private final QnaService qnaService;

    @GetMapping
    public ResponseEntity<?> getQuestions(
            @RequestParam(value = "scope", required = false, defaultValue = "PUBLIC") String scope,
            @RequestParam(value = "category", required = false) QnaCategory category,
            @RequestParam(value = "status", required = false) QnaStatus status,
            @RequestParam(value = "query", required = false) String query,
            @RequestParam(value = "page", required = false, defaultValue = "1") int page,
            @RequestParam(value = "size", required = false, defaultValue = "10") int size,
            @AuthenticationPrincipal PrincipalDetails principalDetails
    ) {
        UUID actorUserId = principalDetails != null ? principalDetails.getUsers().getPublicId() : null;

        if ("MINE".equalsIgnoreCase(scope)) {
            QnaDtos.PageResponse<QnaDtos.QuestionResponse> response = qnaService.listMine(actorUserId, category, status, query, page, size);
            return ResponseEntity.ok(response);
        } else {
            QnaDtos.PageResponse<QnaDtos.QuestionResponse> response = qnaService.listPublic(category, status, query, page, size, actorUserId);
            return ResponseEntity.ok(response);
        }
    }

    @GetMapping("/{publicId}")
    public ResponseEntity<QnaDtos.QuestionResponse> getQuestion(
            @PathVariable("publicId") UUID publicId,
            @AuthenticationPrincipal PrincipalDetails principalDetails
    ) {
        UUID actorUserId = principalDetails != null ? principalDetails.getUsers().getPublicId() : null;
        QnaQuestion question = qnaService.getForViewer(publicId, actorUserId);
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(question, actorUserId));
    }

    @PostMapping
    public ResponseEntity<QnaDtos.QuestionResponse> createQuestion(
            @Valid @RequestBody QnaDtos.CreateRequest request,
            @AuthenticationPrincipal PrincipalDetails principalDetails
    ) {
        if (principalDetails == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }
        UUID actorUserId = principalDetails.getUsers().getPublicId();
        QnaQuestion created = qnaService.create(actorUserId, request.title(), request.body(), request.category(), request.visibility());
        return ResponseEntity.status(HttpStatus.CREATED).body(QnaDtos.QuestionResponse.from(created, actorUserId));
    }

    @PatchMapping("/{publicId}")
    public ResponseEntity<QnaDtos.QuestionResponse> updateQuestion(
            @PathVariable("publicId") UUID publicId,
            @RequestBody QnaDtos.UpdateRequest request,
            @AuthenticationPrincipal PrincipalDetails principalDetails
    ) {
        if (principalDetails == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }
        UUID actorUserId = principalDetails.getUsers().getPublicId();
        QnaQuestion updated = qnaService.updateByAuthor(publicId, actorUserId, request.title(), request.body(), request.category(), request.visibility());
        return ResponseEntity.ok(QnaDtos.QuestionResponse.from(updated, actorUserId));
    }

    @DeleteMapping("/{publicId}")
    public ResponseEntity<Void> deleteQuestion(
            @PathVariable("publicId") UUID publicId,
            @AuthenticationPrincipal PrincipalDetails principalDetails
    ) {
        if (principalDetails == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }
        UUID actorUserId = principalDetails.getUsers().getPublicId();
        qnaService.deleteByAuthor(publicId, actorUserId);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(QnaException.class)
    public ResponseEntity<Map<String, Object>> handleQnaException(QnaException ex) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("code", ex.getErrorCode() != null ? ex.getErrorCode() : "QNA_ERROR");
        body.put("message", ex.getMessage() != null ? ex.getMessage() : "");
        body.put("timestamp", OffsetDateTime.now().toString());
        return ResponseEntity.status(ex.getStatus()).body(body);
    }
}
