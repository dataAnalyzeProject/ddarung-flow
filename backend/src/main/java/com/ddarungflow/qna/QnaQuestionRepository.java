package com.ddarungflow.qna;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QnaQuestionRepository extends JpaRepository<QnaQuestion, Long> {

    Optional<QnaQuestion> findByPublicId(UUID publicId);

    @Query("""
        SELECT q FROM QnaQuestion q
        WHERE q.visibility = com.ddarungflow.qna.QnaVisibility.PUBLIC
          AND q.status != com.ddarungflow.qna.QnaStatus.HIDDEN
          AND (:category IS NULL OR q.category = :category)
          AND (:status IS NULL OR q.status = :status)
          AND (:query IS NULL OR :query = '' OR LOWER(q.title) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(q.body) LIKE LOWER(CONCAT('%', :query, '%')))
        ORDER BY q.createdAt DESC
    """)
    org.springframework.data.domain.Page<QnaQuestion> findPublicNonHiddenQuestions(
            @org.springframework.data.repository.query.Param("category") QnaCategory category,
            @org.springframework.data.repository.query.Param("status") QnaStatus status,
            @org.springframework.data.repository.query.Param("query") String query,
            org.springframework.data.domain.Pageable pageable
    );

    @Query("""
        SELECT q FROM QnaQuestion q
        WHERE q.authorUserId = :authorUserId
          AND q.status != com.ddarungflow.qna.QnaStatus.HIDDEN
          AND (:category IS NULL OR q.category = :category)
          AND (:status IS NULL OR q.status = :status)
          AND (:query IS NULL OR :query = '' OR LOWER(q.title) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(q.body) LIKE LOWER(CONCAT('%', :query, '%')))
        ORDER BY q.createdAt DESC
    """)
    org.springframework.data.domain.Page<QnaQuestion> findByAuthorUserIdNonHidden(
            @org.springframework.data.repository.query.Param("authorUserId") UUID authorUserId,
            @org.springframework.data.repository.query.Param("category") QnaCategory category,
            @org.springframework.data.repository.query.Param("status") QnaStatus status,
            @org.springframework.data.repository.query.Param("query") String query,
            org.springframework.data.domain.Pageable pageable
    );
}
