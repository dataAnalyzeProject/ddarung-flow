package com.ddarungflow.service;

import com.ddarungflow.dto.QuestionCreateRequest;
import com.ddarungflow.dto.QuestionResponse;
import com.ddarungflow.dto.QuestionUpdateRequest;
import com.ddarungflow.entity.*;
import com.ddarungflow.exception.QnaException;
import com.ddarungflow.repository.QuestionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QuestionService {

    private final QuestionRepository questionRepository;

    public List<QuestionResponse> getQuestions(String scope, Users currentUser, QuestionCategory category, QuestionStatus status, String query) {
        String normalizedScope = scope != null ? scope.toUpperCase() : "PUBLIC";

        if ("MINE".equals(normalizedScope) && currentUser == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        List<Question> questions = questionRepository.findQuestionsWithFilters(
                normalizedScope, currentUser, category, status, query
        );

        return questions.stream()
                .map(QuestionResponse::from)
                .collect(Collectors.toList());
    }

    public QuestionResponse getQuestion(UUID publicId, Users currentUser) {
        Question question = questionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (question.getVisibility() == QuestionVisibility.PRIVATE) {
            if (currentUser == null) {
                // 비로그인 사용자는 404 숨김 처리
                throw new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다.");
            }
            if (!question.getAuthor().getId().equals(currentUser.getId())) {
                // 타인 비공개 글 접근 403 Forbidden
                throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "해당 질문에 대한 접근 권한이 없습니다.");
            }
        }

        return QuestionResponse.from(question);
    }

    @Transactional
    public QuestionResponse createQuestion(QuestionCreateRequest request, Users currentUser) {
        if (currentUser == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        Question question = Question.builder()
                .author(currentUser)
                .category(request.getCategory())
                .visibility(request.getVisibility())
                .title(request.getTitle())
                .body(request.getBody())
                .build();

        Question saved = questionRepository.save(question);
        return QuestionResponse.from(saved);
    }

    @Transactional
    public QuestionResponse updateQuestion(UUID publicId, QuestionUpdateRequest request, Users currentUser) {
        if (currentUser == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        Question question = questionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (!question.getAuthor().getId().equals(currentUser.getId())) {
            throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "질문 수정 권한이 없습니다.");
        }

        question.updateContent(request.getCategory(), request.getVisibility(), request.getTitle(), request.getBody());
        return QuestionResponse.from(question);
    }

    @Transactional
    public void deleteQuestion(UUID publicId, Users currentUser) {
        if (currentUser == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        Question question = questionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (!question.getAuthor().getId().equals(currentUser.getId())) {
            throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "질문 삭제 권한이 없습니다.");
        }

        questionRepository.delete(question);
    }
}
