package com.ddarungflow.qna;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
class QnaControllerTest {

    @Autowired
    private QnaController qnaController;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UsersRepository usersRepository;

    @Autowired
    private QnaQuestionRepository qnaQuestionRepository;

    private MockMvc mockMvc;

    private Users userA;
    private Users userB;
    private UsernamePasswordAuthenticationToken authUserA;
    private UsernamePasswordAuthenticationToken authUserB;

    private QnaQuestion publicQuestionUserA;
    private QnaQuestion privateQuestionUserA;

    private static RequestPostProcessor withUser(UsernamePasswordAuthenticationToken auth) {
        return request -> {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            if (auth != null) {
                context.setAuthentication(auth);
            }
            SecurityContextHolder.setContext(context);
            return request;
        };
    }

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();

        mockMvc = MockMvcBuilders.standaloneSetup(qnaController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(qnaController)
                .build();

        qnaQuestionRepository.deleteAll();
        usersRepository.deleteAll();

        userA = usersRepository.save(new Users("google", "user-a-provider", "User A", "usera@example.com", OffsetDateTime.now()));
        userB = usersRepository.save(new Users("naver", "user-b-provider", "User B", "userb@example.com", OffsetDateTime.now()));

        PrincipalDetails detailsA = new PrincipalDetails(userA);
        authUserA = new UsernamePasswordAuthenticationToken(detailsA, null, detailsA.getAuthorities());

        PrincipalDetails detailsB = new PrincipalDetails(userB);
        authUserB = new UsernamePasswordAuthenticationToken(detailsB, null, detailsB.getAuthorities());

        publicQuestionUserA = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userA.getPublicId())
                .title("User A Public Title")
                .body("User A Public Body")
                .category(QnaCategory.SERVICE)
                .visibility(QnaVisibility.PUBLIC)
                .status(QnaStatus.OPEN)
                .build());

        privateQuestionUserA = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userA.getPublicId())
                .title("User A Private Title")
                .body("User A Private Body")
                .category(QnaCategory.ACCOUNT)
                .visibility(QnaVisibility.PUBLIC) // ACCOUNT -> forced PRIVATE
                .status(QnaStatus.ANSWERED)
                .build());
    }

    @Test
    @DisplayName("DTO JSON 필드 구조 및 데이터 검증")
    void testQuestionResponseJsonFields() throws Exception {
        mockMvc.perform(get("/api/v1/qna/questions/" + publicQuestionUserA.getPublicId())
                        .with(withUser(authUserA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(publicQuestionUserA.getPublicId().toString()))
                .andExpect(jsonPath("$.title").value("User A Public Title"))
                .andExpect(jsonPath("$.body").value("User A Public Body"))
                .andExpect(jsonPath("$.category").value("SERVICE"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.isAuthor").value(true))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.updatedAt").exists());
    }

    @Test
    @DisplayName("401: 미인증 사용자가 scope=MINE 조회 시 401 및 고정 오류 JSON을 반환한다")
    void testUnauthenticated401() throws Exception {
        mockMvc.perform(get("/api/v1/qna/questions").param("scope", "MINE"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("QNA_UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("로그인이 필요한 서비스입니다."))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("403: 타인의 질문 수정 시 403을 반환한다")
    void testForbiddenUpdate403() throws Exception {
        QnaDtos.UpdateRequest updateRequest = new QnaDtos.UpdateRequest("수정 시도", "내용", QnaCategory.SERVICE, QnaVisibility.PUBLIC);

        mockMvc.perform(patch("/api/v1/qna/questions/" + publicQuestionUserA.getPublicId())
                        .with(withUser(authUserB))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("QNA_FORBIDDEN"))
                .andExpect(jsonPath("$.message").exists())
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("403: 타인의 질문 삭제 시 403을 반환한다")
    void testForbiddenDelete403() throws Exception {
        mockMvc.perform(delete("/api/v1/qna/questions/" + publicQuestionUserA.getPublicId())
                        .with(withUser(authUserB)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("QNA_FORBIDDEN"))
                .andExpect(jsonPath("$.message").exists())
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("404: 미인증 사용자가 PRIVATE 질문 단건 조회 시 404 숨김 처리 및 고정 오류 JSON을 반환한다")
    void testPrivate404ForUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/v1/qna/questions/" + privateQuestionUserA.getPublicId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QNA_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("해당 질문을 찾을 수 없습니다."))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("409: 답변 완료(ANSWERED) 질문 수정 시 409 Conflict 및 고정 오류 JSON을 반환한다")
    void testConflictUpdate409() throws Exception {
        QnaDtos.UpdateRequest updateRequest = new QnaDtos.UpdateRequest("수정 시도", "내용", QnaCategory.ACCOUNT, QnaVisibility.PRIVATE);

        mockMvc.perform(patch("/api/v1/qna/questions/" + privateQuestionUserA.getPublicId())
                        .with(withUser(authUserA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("QNA_CONFLICT"))
                .andExpect(jsonPath("$.message").value("답변 완료된 질문은 수정할 수 없습니다."))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("PageResponse JSON 구조 검증")
    void testPageResponseJsonStructure() throws Exception {
        mockMvc.perform(get("/api/v1/qna/questions").param("scope", "PUBLIC")
                        .with(withUser(authUserA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.total").exists());
    }
}
