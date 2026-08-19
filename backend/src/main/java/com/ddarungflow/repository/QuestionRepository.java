package com.ddarungflow.repository;

import com.ddarungflow.entity.Question;
import com.ddarungflow.entity.QuestionCategory;
import com.ddarungflow.entity.QuestionStatus;
import com.ddarungflow.entity.QuestionVisibility;
import com.ddarungflow.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    Optional<Question> findByPublicId(UUID publicId);

    @Query("""
        SELECT q FROM Question q
        JOIN FETCH q.author a
        WHERE (:scope = 'MINE' AND a = :user)
           OR (:scope = 'PUBLIC' AND (
                q.visibility = com.ddarungflow.entity.QuestionVisibility.PUBLIC
                OR ( :user IS NOT NULL AND a = :user )
              ))
           OR (:scope IS NULL AND (
                q.visibility = com.ddarungflow.entity.QuestionVisibility.PUBLIC
                OR ( :user IS NOT NULL AND a = :user )
              ))
        AND (:category IS NULL OR q.category = :category)
        AND (:status IS NULL OR q.status = :status)
        AND (:query IS NULL OR :query = '' OR LOWER(q.title) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(q.body) LIKE LOWER(CONCAT('%', :query, '%')))
        ORDER BY q.createdAt DESC
    """)
    List<Question> findQuestionsWithFilters(
            @Param("scope") String scope,
            @Param("user") Users user,
            @Param("category") QuestionCategory category,
            @Param("status") QuestionStatus status,
            @Param("query") String query
    );
}
