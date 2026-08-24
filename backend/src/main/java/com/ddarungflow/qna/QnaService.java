package com.ddarungflow.qna;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QnaService {

    private final QnaQuestionRepository questionRepository;
    private final QnaAnswerRepository answerRepository;

    @Transactional
    public QnaQuestion createQuestion(QnaQuestion question) {
        if (question == null) {
            throw new IllegalArgumentException("질문 정보는 필수입니다.");
        }
        if (question.getTitle() == null || question.getTitle().isBlank()) {
            throw new IllegalArgumentException("질문 제목은 필수입니다.");
        }
        if (question.getContent() == null || question.getContent().isBlank()) {
            throw new IllegalArgumentException("질문 내용은 필수입니다.");
        }
        question.enforceCategoryVisibilityRules();
        return questionRepository.save(question);
    }

    public QnaQuestion getQuestion(Long id) {
        return questionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("질문을 찾을 수 없습니다. ID: " + id));
    }

    public List<QnaQuestion> getAllQuestions() {
        return questionRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<QnaQuestion> getPublicQuestions() {
        return questionRepository.findByVisibilityAndStatusNotOrderByCreatedAtDesc(QnaVisibility.PUBLIC, QnaStatus.HIDDEN);
    }

    public List<QnaQuestion> getQuestionsByCategory(QnaCategory category) {
        return questionRepository.findByCategoryOrderByCreatedAtDesc(category);
    }

    public List<QnaQuestion> getQuestionsByVisibility(QnaVisibility visibility) {
        return questionRepository.findByVisibilityOrderByCreatedAtDesc(visibility);
    }

    public List<QnaQuestion> getQuestionsByStatus(QnaStatus status) {
        return questionRepository.findByStatusOrderByCreatedAtDesc(status);
    }

    public List<QnaQuestion> getQuestionsByAuthorId(Long authorId) {
        return questionRepository.findByAuthorIdOrderByCreatedAtDesc(authorId);
    }

    @Transactional
    public QnaQuestion updateQuestion(Long id, Long requesterId, String title, String content,
                                       QnaCategory category, QnaVisibility visibility, String secretPin) {
        QnaQuestion question = getQuestion(id);
        if (!question.isAuthor(requesterId)) {
            throw new SecurityException("작성자만 질문을 수정할 수 있습니다.");
        }
        validateQuestionModifiable(question);
        question.update(title, content, category, visibility, secretPin);
        return question;
    }

    @Transactional
    public QnaQuestion updateQuestion(Long id, String title, String content,
                                       QnaCategory category, QnaVisibility visibility, String secretPin) {
        QnaQuestion question = getQuestion(id);
        validateQuestionModifiable(question);
        question.update(title, content, category, visibility, secretPin);
        return question;
    }

    @Transactional
    public QnaQuestion changeQuestionStatus(Long id, QnaStatus status) {
        QnaQuestion question = getQuestion(id);
        if (question.getStatus() == QnaStatus.HIDDEN || question.getStatus() == QnaStatus.CLOSED) {
            if (status != question.getStatus()) {
                throw new IllegalStateException("숨김 처리되거나 마감된 질문의 상태는 변경할 수 없습니다.");
            }
        }
        question.changeStatus(status);
        return question;
    }

    @Transactional
    public QnaQuestion hideQuestion(Long id) {
        QnaQuestion question = getQuestion(id);
        question.changeStatus(QnaStatus.HIDDEN);
        return question;
    }

    @Transactional
    public void deleteQuestion(Long id, Long requesterId) {
        QnaQuestion question = getQuestion(id);
        if (!question.isAuthor(requesterId)) {
            throw new SecurityException("작성자만 질문을 삭제할 수 있습니다.");
        }
        answerRepository.deleteByQuestionId(question.getId());
        questionRepository.delete(question);
    }

    @Transactional
    public void deleteQuestion(Long id) {
        QnaQuestion question = getQuestion(id);
        answerRepository.deleteByQuestionId(question.getId());
        questionRepository.delete(question);
    }

    @Transactional
    public QnaAnswer addAnswer(Long questionId, Long responderId, String responderName, String content) {
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("답변 내용은 필수입니다.");
        }

        QnaQuestion question = getQuestion(questionId);

        if (question.getStatus() == QnaStatus.HIDDEN || question.getStatus() == QnaStatus.CLOSED) {
            throw new IllegalStateException("숨김 처리되거나 마감된 질문에는 답변을 등록할 수 없습니다.");
        }

        if (answerRepository.countByQuestionId(questionId) > 0) {
            throw new IllegalStateException("이미 답변이 등록된 질문입니다.");
        }

        QnaAnswer answer = QnaAnswer.builder()
                .question(question)
                .responderId(responderId)
                .responderName(responderName)
                .content(content)
                .build();

        QnaAnswer savedAnswer = answerRepository.save(answer);
        question.changeStatus(QnaStatus.ANSWERED);
        return savedAnswer;
    }

    public List<QnaAnswer> getAnswersByQuestionId(Long questionId) {
        getQuestion(questionId);
        return answerRepository.findByQuestionIdOrderByCreatedAtAsc(questionId);
    }

    @Transactional
    public QnaAnswer updateAnswer(Long answerId, String newContent) {
        if (newContent == null || newContent.isBlank()) {
            throw new IllegalArgumentException("답변 내용은 필수입니다.");
        }
        QnaAnswer answer = answerRepository.findById(answerId)
                .orElseThrow(() -> new IllegalArgumentException("답변을 찾을 수 없습니다. ID: " + answerId));

        if (answer.getQuestion().getStatus() == QnaStatus.HIDDEN || answer.getQuestion().getStatus() == QnaStatus.CLOSED) {
            throw new IllegalStateException("숨김 처리되거나 마감된 질문의 답변은 수정할 수 없습니다.");
        }

        answer.updateContent(newContent);
        return answer;
    }

    @Transactional
    public void deleteAnswer(Long answerId) {
        QnaAnswer answer = answerRepository.findById(answerId)
                .orElseThrow(() -> new IllegalArgumentException("답변을 찾을 수 없습니다. ID: " + answerId));

        QnaQuestion question = answer.getQuestion();
        answerRepository.delete(answer);

        long remainingAnswers = answerRepository.countByQuestionId(question.getId());
        if (remainingAnswers == 0) {
            question.changeStatus(QnaStatus.PENDING);
        } else {
            question.changeStatus(QnaStatus.ANSWERED);
        }
    }

    private void validateQuestionModifiable(QnaQuestion question) {
        if (question.getStatus() == QnaStatus.HIDDEN || question.getStatus() == QnaStatus.CLOSED) {
            throw new IllegalStateException("숨김 처리되거나 마감된 질문은 수정할 수 없습니다.");
        }
    }
}
