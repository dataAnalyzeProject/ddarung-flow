package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.notification.InAppNotification;
import com.ddarungflow.notification.InAppNotificationRepository;
import com.ddarungflow.qna.*;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UsersRepository usersRepository;

    @Autowired
    private QnaQuestionRepository questionRepository;

    @Autowired
    private QnaAnswerRepository answerRepository;

    @Autowired
    private InAppNotificationRepository inAppNotificationRepository;

    @BeforeEach
    void setUp() {
        inAppNotificationRepository.deleteAll();
        answerRepository.deleteAll();
        questionRepository.deleteAll();
        usersRepository.deleteAll();
    }

    private UsernamePasswordAuthenticationToken authenticationFor(UserRole role, String name) {
        Users user = usersRepository.save(Users.builder()
                .provider("google")
                .providerUserId("user-" + role.name() + "-" + System.nanoTime())
                .displayName(name)
                .email(name + "@test.com")
                .role(role)
                .build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    @Nested
    @DisplayName("Q&A 관리자 권한 접근 제어 테스트")
    class SecurityAccessControlTests {

        @Test
        @DisplayName("비로그인 사용자가 Q&A 목록 조회 시 401 AUTH_REQUIRED 응답")
        void anonymousAccess_Questions_Returns401() throws Exception {
            mockMvc.perform(get("/api/v1/admin/qna/questions"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("일반 사용자(USER)가 Q&A 목록 조회 시 403 ADMIN_ACCESS_DENIED 응답")
        void userAccess_Questions_Returns403() throws Exception {
            mockMvc.perform(get("/api/v1/admin/qna/questions")
                            .with(authentication(authenticationFor(UserRole.USER, "일반유저"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("일반 사용자(USER)가 질문 숨김 시도 시 403 ADMIN_ACCESS_DENIED 응답")
        void userAccess_HideQuestion_Returns403() throws Exception {
            mockMvc.perform(post("/api/v1/admin/qna/questions/1/hide")
                            .with(csrf())
                            .with(authentication(authenticationFor(UserRole.USER, "일반유저"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("일반 사용자(USER)가 답변 등록 시도 시 403 ADMIN_ACCESS_DENIED 응답")
        void userAccess_AddAnswer_Returns403() throws Exception {
            mockMvc.perform(post("/api/v1/admin/qna/questions/1/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"불법 답변\"}")
                            .with(authentication(authenticationFor(UserRole.USER, "일반유저"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"))
                    .andExpect(jsonPath("$.message").exists());
        }
    }

    @Nested
    @DisplayName("ADMIN 권한 기능 및 오류 상태 코드 (404, 409) 테스트")
    class AdminOperationsAndErrorStatusTests {

        @Test
        @DisplayName("관리자(ADMIN)는 전체 Q&A 질문 목록을 정상 조회할 수 있음")
        void adminCanListQuestions() throws Exception {
            questionRepository.save(QnaQuestion.builder()
                    .title("질문 1")
                    .content("내용 1")
                    .category(QnaCategory.USAGE)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            questionRepository.save(QnaQuestion.builder()
                    .title("질문 2")
                    .content("내용 2")
                    .category(QnaCategory.ACCOUNT)
                    .visibility(QnaVisibility.PRIVATE)
                    .build());

            mockMvc.perform(get("/api/v1/admin/qna/questions")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));
        }

        @Test
        @DisplayName("관리자(ADMIN)가 질문을 숨김(HIDDEN) 처리할 수 있음")
        void adminCanHideQuestion() throws Exception {
            QnaQuestion q = questionRepository.save(QnaQuestion.builder()
                    .title("부적절한 질문")
                    .content("내용")
                    .category(QnaCategory.OTHER)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            mockMvc.perform(post("/api/v1/admin/qna/questions/" + q.getId() + "/hide")
                            .with(csrf())
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("HIDDEN"));

            QnaQuestion updated = questionRepository.findById(q.getId()).orElseThrow();
            assertThat(updated.getStatus()).isEqualTo(QnaStatus.HIDDEN);
        }

        @Test
        @DisplayName("존재하지 않는 질문에 답변 또는 숨김 처리 시 404 NOT_FOUND 반환")
        void nonExistentQuestion_Returns404() throws Exception {
            mockMvc.perform(post("/api/v1/admin/qna/questions/99999/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"답변 내용\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("QUESTION_NOT_FOUND"))
                    .andExpect(jsonPath("$.message").exists());

            mockMvc.perform(post("/api/v1/admin/qna/questions/99999/hide")
                            .with(csrf())
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("QUESTION_NOT_FOUND"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("숨김(HIDDEN) 상태 질문에 답변 시도 시 409 CONFLICT 반환")
        void answerHiddenQuestion_Returns409() throws Exception {
            QnaQuestion hiddenQuestion = questionRepository.save(QnaQuestion.builder()
                    .title("숨겨진 질문")
                    .content("내용")
                    .status(QnaStatus.HIDDEN)
                    .category(QnaCategory.OTHER)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            mockMvc.perform(post("/api/v1/admin/qna/questions/" + hiddenQuestion.getId() + "/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"숨긴 질문 답변 시도\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("INVALID_QUESTION_STATUS"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("마감(CLOSED) 상태 질문에 답변 시도 시 409 CONFLICT 반환")
        void answerClosedQuestion_Returns409() throws Exception {
            QnaQuestion closedQuestion = questionRepository.save(QnaQuestion.builder()
                    .title("마감된 질문")
                    .content("내용")
                    .status(QnaStatus.CLOSED)
                    .category(QnaCategory.OTHER)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            mockMvc.perform(post("/api/v1/admin/qna/questions/" + closedQuestion.getId() + "/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"마감 질문 답변 시도\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("INVALID_QUESTION_STATUS"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("이미 답변이 존재하는 질문에 두 번째 답변 시도 시 409 CONFLICT 반환")
        void duplicateAnswer_Returns409() throws Exception {
            QnaQuestion question = questionRepository.save(QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .category(QnaCategory.OTHER)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            // 첫 번째 답변 등록
            mockMvc.perform(post("/api/v1/admin/qna/questions/" + question.getId() + "/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"첫 번째 답변\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자A"))))
                    .andExpect(status().isCreated());

            // 두 번째 답변 시도 -> 409
            mockMvc.perform(post("/api/v1/admin/qna/questions/" + question.getId() + "/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"두 번째 중복 답변 시도\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "관리자B"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_ANSWER"))
                    .andExpect(jsonPath("$.message").exists());
        }

        @Test
        @DisplayName("관리자(ADMIN)의 첫 답변 등록 성공 시 질문 상태가 ANSWERED로 변경되고 질문 작성자에게만 QNA_ANSWERED 알림 1건 생성됨")
        void adminAddFirstAnswer_Success_GeneratesNotificationRules() throws Exception {
            // 질문 작성자 (User)
            Users author = usersRepository.save(Users.builder()
                    .provider("google")
                    .providerUserId("author-user-001")
                    .displayName("질문작성자")
                    .email("author@example.com")
                    .role(UserRole.USER)
                    .build());

            // 제3자 (Other User)
            Users otherUser = usersRepository.save(Users.builder()
                    .provider("google")
                    .providerUserId("other-user-002")
                    .displayName("다른사용자")
                    .email("other@example.com")
                    .role(UserRole.USER)
                    .build());

            QnaQuestion question = questionRepository.save(QnaQuestion.builder()
                    .authorId(author.getId())
                    .authorName(author.getDisplayName())
                    .title("대여소 이용 방법 문의")
                    .content("대여소에서 QR 코드가 안 찍힙니다.")
                    .category(QnaCategory.USAGE)
                    .visibility(QnaVisibility.PUBLIC)
                    .build());

            // 관리자가 답변 등록
            mockMvc.perform(post("/api/v1/admin/qna/questions/" + question.getId() + "/answer")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"블루투스 권한을 켜고 다시 시도해주세요.\"}")
                            .with(authentication(authenticationFor(UserRole.ADMIN, "운영관리자"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.content").value("블루투스 권한을 켜고 다시 시도해주세요."));

            // 1. 질문 상태가 ANSWERED로 변경되었는지 확인
            QnaQuestion answeredQuestion = questionRepository.findById(question.getId()).orElseThrow();
            assertThat(answeredQuestion.getStatus()).isEqualTo(QnaStatus.ANSWERED);

            // 2. 질문 작성자에게만 QNA_ANSWERED 알림이 정확히 1건 생성되었는지 검증
            List<InAppNotification> authorNotifications = inAppNotificationRepository.findByUserIdOrderByCreatedAtDesc(author.getId());
            assertThat(authorNotifications).hasSize(1);

            InAppNotification notif = authorNotifications.get(0);
            assertThat(notif.getUserId()).isEqualTo(author.getId());
            assertThat(notif.getDedupKey()).isEqualTo("qna-answered:" + question.getId());
            assertThat(notif.getTitle()).isEqualTo("QNA_ANSWERED");
            assertThat(notif.getMessage()).contains("답변이 완료되었습니다");
            // 질문·답변 원문, 연락처, 토큰·세션은 알림에 포함되지 않음 검증
            assertThat(notif.getMessage()).doesNotContain("대여소 이용 방법 문의");
            assertThat(notif.getMessage()).doesNotContain("블루투스 권한");

            // 3. 제3자에게는 알림이 생성되지 않음을 검증
            List<InAppNotification> otherNotifications = inAppNotificationRepository.findByUserIdOrderByCreatedAtDesc(otherUser.getId());
            assertThat(otherNotifications).isEmpty();
        }
    }
}
