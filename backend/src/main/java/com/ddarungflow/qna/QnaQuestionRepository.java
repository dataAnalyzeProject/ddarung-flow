package com.ddarungflow.qna;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QnaQuestionRepository extends JpaRepository<QnaQuestion, Long> {

    List<QnaQuestion> findAllByOrderByCreatedAtDesc();

    List<QnaQuestion> findByCategoryOrderByCreatedAtDesc(QnaCategory category);

    List<QnaQuestion> findByVisibilityOrderByCreatedAtDesc(QnaVisibility visibility);

    List<QnaQuestion> findByVisibilityAndStatusNotOrderByCreatedAtDesc(QnaVisibility visibility, QnaStatus status);

    List<QnaQuestion> findByStatusOrderByCreatedAtDesc(QnaStatus status);

    List<QnaQuestion> findByAuthorIdOrderByCreatedAtDesc(Long authorId);
}
