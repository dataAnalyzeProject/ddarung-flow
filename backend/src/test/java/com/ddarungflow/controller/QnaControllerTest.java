package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.qna.QnaAnswerRepository;
import com.ddarungflow.qna.QnaCategory;
import com.ddarungflow.qna.QnaQuestion;
import com.ddarungflow.qna.QnaQuestionRepository;
import com.ddarungflow.qna.QnaVisibility;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class QnaControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UsersRepository usersRepository;
    @Autowired private QnaQuestionRepository questionRepository;
    @Autowired private QnaAnswerRepository answerRepository;

    @BeforeEach
    void clean() {
        answerRepository.deleteAll();
        questionRepository.deleteAll();
        usersRepository.deleteAll();
    }

    @Test
    void anonymousQnaApiReturnsStructured401() throws Exception {
        mockMvc.perform(get("/api/v1/qna/questions"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void userCannotReadAdminQnaApi() throws Exception {
        mockMvc.perform(get("/api/v1/admin/qna/questions").with(authentication(authFor("user", UserRole.USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    @Test
    void otherUserCannotReadPrivateQuestion() throws Exception {
        Users author = usersRepository.save(user("author", UserRole.USER));
        QnaQuestion question = questionRepository.save(QnaQuestion.builder()
                .authorId(author.getId()).authorName(author.getDisplayName()).title("비공개 질문").content("내용")
                .category(QnaCategory.ACCOUNT).visibility(QnaVisibility.PRIVATE).build());

        mockMvc.perform(get("/api/v1/qna/questions/{id}", question.getId()).with(authentication(authFor("reader", UserRole.USER))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QNA_NOT_FOUND"));
    }

    @Test
    void adminCannotAnswerTheSameQuestionTwice() throws Exception {
        Users author = usersRepository.save(user("author", UserRole.USER));
        QnaQuestion question = questionRepository.save(QnaQuestion.builder()
                .authorId(author.getId()).authorName(author.getDisplayName()).title("질문").content("내용")
                .category(QnaCategory.OTHER).visibility(QnaVisibility.PUBLIC).build());
        UsernamePasswordAuthenticationToken admin = authFor("admin", UserRole.ADMIN);

        mockMvc.perform(post("/api/v1/admin/qna/questions/{id}/answer", question.getId())
                        .with(authentication(admin)).with(csrf()).contentType("application/json").content("{\"body\":\"첫 답변\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/qna/questions/{id}/answer", question.getId())
                        .with(authentication(admin)).with(csrf()).contentType("application/json").content("{\"body\":\"두 번째 답변\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("QNA_CONFLICT"));
    }

    private UsernamePasswordAuthenticationToken authFor(String id, UserRole role) {
        Users saved = usersRepository.save(user(id, role));
        PrincipalDetails principal = com.ddarungflow.support.AdminSecurityTestSupport.principal(saved);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    private Users user(String id, UserRole role) {
        return Users.builder().provider("google").providerUserId(id).displayName(id).email(null).role(role).build();
    }
}
