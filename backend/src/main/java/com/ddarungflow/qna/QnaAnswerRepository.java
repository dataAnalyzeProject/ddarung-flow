package com.ddarungflow.qna;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QnaAnswerRepository extends JpaRepository<QnaAnswer, Long> {

    List<QnaAnswer> findByQuestionIdOrderByCreatedAtAsc(Long questionId);

    long countByQuestionId(Long questionId);

    void deleteByQuestionId(Long questionId);
}
