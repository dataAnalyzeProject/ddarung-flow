package com.ddarungflow.qna;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class QnaServiceTest {

    @Mock
    private QnaQuestionRepository questionRepository;

    @Mock
    private QnaAnswerRepository answerRepository;

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
        @DisplayName("작성자가 아닌 사용자가 질문 수정 시 예외 발생")
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
                    .hasMessageContaining("작성자만");
        }

        @Test
        @DisplayName("작성자가 아닌 사용자가 질문 삭제 시 예외 발생")
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
                    .hasMessageContaining("작성자만");
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
    }

    @Nested
    @DisplayName("답변 중복 및 삭제 상태 관리 테스트")
    class AnswerStatusTests {

        @Test
        @DisplayName("관리자 추가/중복 답변 작성 시 질문 상태가 ANSWERED로 설정됨")
        void addAnswer_MultipleAnswers_SetsStatusAnswered() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .status(QnaStatus.PENDING)
                    .build();

            given(questionRepository.findById(1L)).willReturn(Optional.of(question));
            given(answerRepository.save(any(QnaAnswer.class))).willAnswer(invocation -> invocation.getArgument(0));

            // when - 첫 번째 답변
            qnaService.addAnswer(1L, 100L, "관리자1", "첫 번째 답변입니다.");
            assertThat(question.getStatus()).isEqualTo(QnaStatus.ANSWERED);

            // when - 두 번째 중복 답변
            qnaService.addAnswer(1L, 101L, "관리자2", "추가 답변입니다.");

            // then
            assertThat(question.getStatus()).isEqualTo(QnaStatus.ANSWERED);
        }

        @Test
        @DisplayName("다중 답변 중 1개 삭제 시 다른 답변이 남아있으면 ANSWERED 유지")
        void deleteAnswer_MultipleAnswersRemain_StatusStaysAnswered() {
            // given
            QnaQuestion question = QnaQuestion.builder()
                    .title("질문")
                    .content("내용")
                    .status(QnaStatus.ANSWERED)
                    .build();

            QnaAnswer answer1 = QnaAnswer.builder().question(question).responderName("관리자1").content("답변1").build();

            given(answerRepository.findById(10L)).willReturn(Optional.of(answer1));
            given(answerRepository.countByQuestionId(question.getId())).willReturn(1L); // 1개 남아있음

            // when
            qnaService.deleteAnswer(10L);

            // then
            verify(answerRepository).delete(answer1);
            assertThat(question.getStatus()).isEqualTo(QnaStatus.ANSWERED);
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
            given(answerRepository.countByQuestionId(question.getId())).willReturn(0L); // 0개 남음

            // when
            qnaService.deleteAnswer(10L);

            // then
            verify(answerRepository).delete(answer);
            assertThat(question.getStatus()).isEqualTo(QnaStatus.PENDING);
        }
    }
}
