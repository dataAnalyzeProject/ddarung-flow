package com.ddarungflow.qna;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.ddarungflow.notification.NotificationService;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class QnaServiceTest {

    @Mock
    private QnaQuestionRepository questionRepository;

    @Mock
    private QnaAnswerRepository answerRepository;

    @Mock
    private NotificationService notificationService;

    @InjectMocks
    private QnaService qnaService;

    @Nested
    @DisplayName("질문 보안 및 상태 규칙 테스트")
    class QuestionSecurityAndStatusTests {

        @Test
        @DisplayName("ACCOUNT 카테고리 질문 생성 시 PRIVATE로 자동 강제됨")
        void createQuestion_AccountCategory_ForcesPrivateVisibility() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L)
                    .title("계정 문의")
                    .content("비밀번호 변경 문의")
                    .category(QnaCategory.ACCOUNT)
                    .visibility(QnaVisibility.PUBLIC)
                    .build();

            given(questionRepository.save(any(QnaQuestion.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            QnaQuestion created = qnaService.createQuestion(question);

            // then
            assertThat(created.getVisibility()).isEqualTo(QnaVisibility.PRIVATE);
        }

        @Test
        @DisplayName("LOCATION 카테고리 질문 생성 시 PRIVATE로 자동 강제됨")
        void createQuestion_LocationCategory_ForcesPrivateVisibility() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L)
                    .title("위치 문의")
                    .content("대여소 위치 상세")
                    .category(QnaCategory.LOCATION)
                    .visibility(QnaVisibility.PUBLIC)
                    .build();

            given(questionRepository.save(any(QnaQuestion.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            QnaQuestion created = qnaService.createQuestion(question);

            // then
            assertThat(created.getVisibility()).isEqualTo(QnaVisibility.PRIVATE);
        }

        @Test
        @DisplayName("작성자 본인이 질문 수정 시 성공")
        void updateQuestion_Author_Success() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(10L)
                    .title("기존 제목")
                    .content("기존 내용")
                    .category(QnaCategory.OTHER)
                    .visibility(QnaVisibility.PUBLIC)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when
            QnaQuestion updated = qnaService.updateQuestion(
                    1L, 10L, "수정된 제목", "수정된 내용", QnaCategory.PAYMENT, QnaVisibility.PRIVATE, "1234");

            // then
            assertThat(updated.getTitle()).isEqualTo("수정된 제목");
            assertThat(updated.getContent()).isEqualTo("수정된 내용");
            assertThat(updated.getCategory()).isEqualTo(QnaCategory.PAYMENT);
            assertThat(updated.getVisibility()).isEqualTo(QnaVisibility.PRIVATE);
        }

        @Test
        @DisplayName("작성자가 아닌 사용자가 질문 수정 시 SecurityException 예외 발생")
        void updateQuestion_NonAuthor_ThrowsSecurityException() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L)
                    .title("제목")
                    .content("내용")
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when & then
            assertThatThrownBy(() -> qnaService.updateQuestion(1L, 999L, "새제목", "새내용", QnaCategory.OTHER, QnaVisibility.PUBLIC, null))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("작성자만 질문을 수정할 수 있습니다.");
        }

        @Test
        @DisplayName("작성자 본인이 질문 삭제 시 성공")
        void deleteQuestion_Author_Success() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(10L)
                    .title("제목")
                    .content("내용")
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when
            qnaService.deleteQuestion(1L, 10L);

            // then
            verify(answerRepository).deleteByQuestionId(question.getId());
            verify(questionRepository).delete(question);
        }

        @Test
        @DisplayName("작성자가 아닌 사용자가 질문 삭제 시 SecurityException 예외 발생")
        void deleteQuestion_NonAuthor_ThrowsSecurityException() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L)
                    .title("제목")
                    .content("내용")
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when & then
            assertThatThrownBy(() -> qnaService.deleteQuestion(1L, 999L))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("작성자만 질문을 삭제할 수 있습니다.");

            verify(questionRepository, never()).delete(any(QnaQuestion.class));
        }

        @Test
        @DisplayName("공개 질문 목록 조회 시 PRIVATE 질문 제외")
        void getPublicQuestions_ExcludesPrivateQuestions() {
            // given
            QnaQuestion publicQ = QnaQuestion.builder().title("공개 질문").visibility(QnaVisibility.PUBLIC).build();
            given(questionRepository.findByVisibilityAndStatusNotOrderByCreatedAtDesc(QnaVisibility.PUBLIC, QnaStatus.HIDDEN))
                    .willReturn(List.of(publicQ));

            // when
            List<QnaQuestion> publicQuestions = qnaService.getPublicQuestions();

            // then
            assertThat(publicQuestions).containsExactly(publicQ);
        }

        @Test
        @DisplayName("다른 사용자는 PRIVATE 질문 상세를 볼 수 없음")
        void getQuestionForViewer_OtherUsersPrivateQuestion_ThrowsNotFound() {
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L).title("비공개 질문").content("내용")
                    .visibility(QnaVisibility.PRIVATE).build();
            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            assertThatThrownBy(() -> qnaService.getQuestionForViewer(1L, 2L, false))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("QNA_NOT_FOUND");
        }

        @Test
        @DisplayName("숨김 질문은 공개 목록에서 제외됨")
        void listPublic_ExcludesHiddenQuestions() {
            QnaQuestion publicQuestion = QnaQuestion.builder()
                    .title("공개 질문").content("내용").visibility(QnaVisibility.PUBLIC).build();
            given(questionRepository.findByVisibilityAndStatusNotOrderByCreatedAtDesc(QnaVisibility.PUBLIC, QnaStatus.HIDDEN))
                    .willReturn(List.of(publicQuestion));

            assertThat(qnaService.listPublic(null, null, null)).containsExactly(publicQuestion);
        }

        @Test
        @DisplayName("질문 숨김 처리 시 상태가 HIDDEN으로 변경됨")
        void hideQuestion_ChangesStatusToHidden() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("숨길 질문")
                    .content("내용")
                    .status(QnaStatus.PENDING)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when
            QnaQuestion hidden = qnaService.hideQuestion(1L);

            // then
            assertThat(hidden.getStatus()).isEqualTo(QnaStatus.HIDDEN);
        }

        @Test
        @DisplayName("숨김(HIDDEN) 처리된 질문 재수정 시도 시 IllegalStateException 예외 발생 및 거부")
        void updateQuestion_HiddenQuestion_ThrowsException() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .authorId(1L)
                    .title("숨겨진 질문")
                    .content("내용")
                    .status(QnaStatus.HIDDEN)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when & then
            assertThatThrownBy(() -> qnaService.updateQuestion(1L, 1L, "수정시도 제목", "수정시도 내용", QnaCategory.OTHER, QnaVisibility.PUBLIC, null))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("숨김 처리되거나 마감된 질문은 수정할 수 없습니다.");
        }

        @Test
        @DisplayName("숨김(HIDDEN) 처리된 질문 상태 변경 시도 시 IllegalStateException 예외 발생 및 거부")
        void changeQuestionStatus_HiddenQuestion_ThrowsException() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("숨겨진 질문")
                    .content("내용")
                    .status(QnaStatus.HIDDEN)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when & then
            assertThatThrownBy(() -> qnaService.changeQuestionStatus(1L, QnaStatus.PENDING))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("숨김 처리되거나 마감된 질문의 상태는 변경할 수 없습니다.");
        }
    }

    @Nested
    @DisplayName("답변 중복 및 삭제 상태 관리 테스트")
    class AnswerStatusTests {

        @Test
        @DisplayName("첫 답변 등록 성공")
        void addAnswer_FirstAnswer_Success() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .status(QnaStatus.PENDING)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));
            given(answerRepository.countByQuestionId(1L)).willReturn(0L);
            given(answerRepository.save(any(QnaAnswer.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when
            QnaAnswer answer = qnaService.addAnswer(1L, 100L, "관리자1", "첫 답변입니다.");

            // then
            assertThat(answer).isNotNull();
            assertThat(question.getStatus()).isEqualTo(QnaStatus.ANSWERED);
            verify(answerRepository).save(any(QnaAnswer.class));
            verify(notificationService).createInAppNotification(question.getAuthorId(), "qna-answered:1",
                    "문의에 답변이 등록되었습니다", question.getTitle(), "QNA_ANSWERED",
                    "QNA_QUESTION", "1");
        }

        @Test
        @DisplayName("이미 답변이 존재하는 질문에 두 번째 답변 추가 시 예외 발생 및 중복 거부")
        void addAnswer_DuplicateAnswer_ThrowsExceptionAndRejects() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .status(QnaStatus.ANSWERED)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));
            given(answerRepository.countByQuestionId(1L)).willReturn(1L);

            // when & then
            assertThatThrownBy(() -> qnaService.addAnswer(1L, 101L, "관리자2", "두 번째 중복 답변 시도"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("이미 답변이 등록된 질문입니다.");

            verify(answerRepository, never()).save(any(QnaAnswer.class));
        }

        @Test
        @DisplayName("숨김(HIDDEN) 처리된 질문에 답변 등록 시도 시 예외 발생 및 거부")
        void addAnswer_HiddenQuestion_ThrowsException() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("숨겨진 질문")
                    .content("내용")
                    .status(QnaStatus.HIDDEN)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));

            // when & then
            assertThatThrownBy(() -> qnaService.addAnswer(1L, 100L, "관리자", "답변 작성 시도"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("숨김 처리되거나 마감된 질문에는 답변을 등록할 수 없습니다.");

            verify(answerRepository, never()).save(any(QnaAnswer.class));
        }

        @Test
        @DisplayName("마지막 답변 삭제 시 질문 상태가 PENDING으로 원복됨")
        void deleteAnswer_LastAnswer_StatusRevertsToPending() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .status(QnaStatus.ANSWERED)
                    .build();

            QnaAnswer answer = QnaAnswer.builder().question(question).responderName("관리자").content("답변").build();

            given(answerRepository.findById(10L)).willReturn(Optional.of(answer));
            given(answerRepository.countByQuestionId(question.getId())).willReturn(0L);

            // when
            qnaService.deleteAnswer(10L);

            // then
            verify(answerRepository).delete(answer);
            assertThat(question.getStatus()).isEqualTo(QnaStatus.PENDING);
        }
    }
}
