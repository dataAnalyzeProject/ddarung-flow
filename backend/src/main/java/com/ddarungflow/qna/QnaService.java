package com.ddarungflow.qna;

import com.ddarungflow.dto.QnaDtos;
import com.ddarungflow.exception.QnaException;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QnaService {

    private final QnaQuestionRepository qnaQuestionRepository;

    public QnaDtos.PageResponse<QnaDtos.QuestionResponse> listPublic(QnaCategory category, QnaStatus status, String query, int page, int size, UUID actorUserId) {
        int pageNum = Math.max(0, page - 1);
        int pageSize = size > 0 ? size : 10;
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(pageNum, pageSize);
        
        org.springframework.data.domain.Page<QnaQuestion> questionPage = qnaQuestionRepository.findPublicNonHiddenQuestions(category, status, query, pageable);
        
        List<QnaDtos.QuestionResponse> items = questionPage.getContent().stream()
                .map(q -> QnaDtos.QuestionResponse.from(q, actorUserId))
                .collect(Collectors.toList());

        return new QnaDtos.PageResponse<>(items, page, size, questionPage.getTotalElements());
    }

    public QnaDtos.PageResponse<QnaDtos.QuestionResponse> listMine(UUID actorUserId, QnaCategory category, QnaStatus status, String query, int page, int size) {
        if (actorUserId == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }
        int pageNum = Math.max(0, page - 1);
        int pageSize = size > 0 ? size : 10;
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(pageNum, pageSize);

        org.springframework.data.domain.Page<QnaQuestion> questionPage = qnaQuestionRepository.findByAuthorUserIdNonHidden(actorUserId, category, status, query, pageable);

        List<QnaDtos.QuestionResponse> items = questionPage.getContent().stream()
                .map(q -> QnaDtos.QuestionResponse.from(q, actorUserId))
                .collect(Collectors.toList());

        return new QnaDtos.PageResponse<>(items, page, size, questionPage.getTotalElements());
    }

    @Transactional
    public QnaQuestion create(UUID actorUserId, String title, String body, QnaCategory category, QnaVisibility visibility) {
        if (actorUserId == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }
        if (title == null || title.isBlank() || body == null || body.isBlank() || category == null) {
            throw new QnaException(HttpStatus.BAD_REQUEST, "INVALID_INPUT_VALUE", "제목, 내용, 카테고리는 필수 입력 항목입니다.");
        }

        QnaQuestion question = QnaQuestion.builder()
                .authorUserId(actorUserId)
                .title(title)
                .body(body)
                .category(category)
                .visibility(visibility)
                .build();

        return qnaQuestionRepository.save(question);
    }

    public QnaQuestion getForViewer(UUID publicId, UUID actorUserId) {
        QnaQuestion question = qnaQuestionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (question.getStatus() == QnaStatus.HIDDEN) {
            throw new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다.");
        }

        if (question.getVisibility() == QnaVisibility.PRIVATE) {
            if (actorUserId == null) {
                throw new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다.");
            }
            if (!question.getAuthorUserId().equals(actorUserId)) {
                throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "해당 질문에 대한 접근 권한이 없습니다.");
            }
        }

        return question;
    }

    @Transactional
    public QnaQuestion updateByAuthor(UUID publicId, UUID actorUserId, String title, String body, QnaCategory category, QnaVisibility visibility) {
        if (actorUserId == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        QnaQuestion question = qnaQuestionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (!question.getAuthorUserId().equals(actorUserId)) {
            throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "질문 수정 권한이 없습니다.");
        }

        question.updateByAuthor(title, body, category, visibility);
        return question;
    }

    @Transactional
    public void deleteByAuthor(UUID publicId, UUID actorUserId) {
        if (actorUserId == null) {
            throw new QnaException(HttpStatus.UNAUTHORIZED, "QNA_UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
        }

        QnaQuestion question = qnaQuestionRepository.findByPublicId(publicId)
                .orElseThrow(() -> new QnaException(HttpStatus.NOT_FOUND, "QNA_NOT_FOUND", "해당 질문을 찾을 수 없습니다."));

        if (!question.getAuthorUserId().equals(actorUserId)) {
            throw new QnaException(HttpStatus.FORBIDDEN, "QNA_FORBIDDEN", "질문 삭제 권한이 없습니다.");
        }

        qnaQuestionRepository.delete(question);
    }
}
