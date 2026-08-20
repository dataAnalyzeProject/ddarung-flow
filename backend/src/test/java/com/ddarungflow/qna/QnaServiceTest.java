package com.ddarungflow.qna;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddarungflow.qna.QnaService.QnaException;
import org.springframework.http.HttpStatus;

@SpringBootTest
@ActiveProfiles("test")
class QnaServiceTest {

    @Autowired
    private QnaService qnaService;

    @Autowired
    private QnaQuestionRepository qnaQuestionRepository;

    private UUID userA;
    private UUID userB;

    private QnaQuestion publicQuestionUserA;
    private QnaQuestion privateQuestionUserA;
    private QnaQuestion hiddenQuestionUserA;
    private QnaQuestion publicQuestionUserB;

    @BeforeEach
    void setUp() {
        qnaQuestionRepository.deleteAll();

        userA = UUID.randomUUID();
        userB = UUID.randomUUID();

        // Fixtures for User A
        publicQuestionUserA = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userA)
                .title("User A Public Question")
                .body("User A public question body")
                .category(QnaCategory.SERVICE)
                .visibility(QnaVisibility.PUBLIC)
                .status(QnaStatus.OPEN)
                .build());

        privateQuestionUserA = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userA)
                .title("User A Private Question")
                .body("User A private question body")
                .category(QnaCategory.ACCOUNT) // Forced PRIVATE
                .visibility(QnaVisibility.PUBLIC)
                .status(QnaStatus.ANSWERED)
                .build());

        hiddenQuestionUserA = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userA)
                .title("User A Hidden Question")
                .body("User A hidden body")
                .category(QnaCategory.PREDICTION)
                .visibility(QnaVisibility.PUBLIC)
                .status(QnaStatus.HIDDEN)
                .build());

        // Fixture for User B
        publicQuestionUserB = qnaQuestionRepository.save(QnaQuestion.builder()
                .authorUserId(userB)
                .title("User B Public Question")
                .body("User B public question body")
                .category(QnaCategory.SERVICE)
                .visibility(QnaVisibility.PUBLIC)
                .status(QnaStatus.OPEN)
                .build());
    }

    @Test
    @DisplayName("listPublic: HIDDEN 질문과 PRIVATE 질문은 소비자 공개 목록에서 제외된다")
    void listPublicExcludesHiddenAndPrivate() {
        var pageResponse = qnaService.listPublic(null, null, null, 1, 10, null);

        assertThat(pageResponse.items())
                .extracting(QnaDtos.QuestionResponse::id)
                .contains(publicQuestionUserA.getPublicId().toString(), publicQuestionUserB.getPublicId().toString())
                .doesNotContain(privateQuestionUserA.getPublicId().toString(), hiddenQuestionUserA.getPublicId().toString());
    }

    @Test
    @DisplayName("listMine: 작성자 본인의 비숨김 질문(PUBLIC, PRIVATE)만 반환하고 HIDDEN은 제외한다")
    void listMineReturnsUserNonHiddenQuestions() {
        var pageResponse = qnaService.listMine(userA, null, null, null, 1, 10);

        assertThat(pageResponse.items())
                .extracting(QnaDtos.QuestionResponse::id)
                .contains(publicQuestionUserA.getPublicId().toString(), privateQuestionUserA.getPublicId().toString())
                .doesNotContain(hiddenQuestionUserA.getPublicId().toString(), publicQuestionUserB.getPublicId().toString());
    }

    @Test
    @DisplayName("create: actorUserId가 인증 유저에서 주어지며 ACCOUNT/LOCATION 카테고리는 PRIVATE 강제 저장된다")
    void createQuestionEnforcesPrivacyAndActor() {
        QnaQuestion created = qnaService.create(
                userA,
                "새 위치 질문",
                "위치 질문 내용",
                QnaCategory.LOCATION,
                QnaVisibility.PUBLIC // PUBLIC 요청이지만 LOCATION이므로 PRIVATE 강제
        );

        assertThat(created.getAuthorUserId()).isEqualTo(userA);
        assertThat(created.getCategory()).isEqualTo(QnaCategory.LOCATION);
        assertThat(created.getVisibility()).isEqualTo(QnaVisibility.PRIVATE);
        assertThat(created.getStatus()).isEqualTo(QnaStatus.OPEN);
    }

    @Test
    @DisplayName("getForViewer: HIDDEN 질문은 404를 반환하고, PRIVATE 질문은 비로그인시 404, 타인 시 403을 반환한다")
    void getForViewerVisibilityAndStatusRules() {
        // HIDDEN -> 404
        assertThatThrownBy(() -> qnaService.getForViewer(hiddenQuestionUserA.getPublicId(), userA))
                .isInstanceOf(QnaException.class)
                .hasMessage("해당 질문을 찾을 수 없습니다.");

        // PRIVATE, 비로그인 -> 404
        assertThatThrownBy(() -> qnaService.getForViewer(privateQuestionUserA.getPublicId(), null))
                .isInstanceOf(QnaException.class)
                .hasMessage("해당 질문을 찾을 수 없습니다.");

        // PRIVATE, 타 유저 -> 403
        assertThatThrownBy(() -> qnaService.getForViewer(privateQuestionUserA.getPublicId(), userB))
                .isInstanceOf(QnaException.class)
                .hasMessage("해당 질문에 대한 접근 권한이 없습니다.");

        // PRIVATE, 본인 유저 -> 정상 반환
        QnaQuestion fetched = qnaService.getForViewer(privateQuestionUserA.getPublicId(), userA);
        assertThat(fetched.getPublicId()).isEqualTo(privateQuestionUserA.getPublicId());
    }

    @Test
    @DisplayName("updateByAuthor: 작성자 수정 시 title/body/category/visibility만 변경되고 updatedAt이 갱신된다")
    void updateByAuthorModifiesAllowedFieldsOnly() throws InterruptedException {
        var beforeUpdatedAt = publicQuestionUserA.getUpdatedAt();
        Thread.sleep(10);

        QnaQuestion updated = qnaService.updateByAuthor(
                publicQuestionUserA.getPublicId(),
                userA,
                "수정된 제목",
                "수정된 내용",
                QnaCategory.PREDICTION,
                QnaVisibility.PUBLIC
        );

        assertThat(updated.getTitle()).isEqualTo("수정된 제목");
        assertThat(updated.getBody()).isEqualTo("수정된 내용");
        assertThat(updated.getCategory()).isEqualTo(QnaCategory.PREDICTION);
        assertThat(updated.getVisibility()).isEqualTo(QnaVisibility.PUBLIC);
        assertThat(updated.getUpdatedAt()).isAfter(beforeUpdatedAt);

        // 타인 수정 시 403
        assertThatThrownBy(() -> qnaService.updateByAuthor(
                publicQuestionUserA.getPublicId(),
                userB,
                "타인 수정 시도",
                "내용",
                QnaCategory.SERVICE,
                QnaVisibility.PUBLIC
        )).isInstanceOf(QnaException.class).hasMessage("질문 수정 권한이 없습니다.");
    }

    @Test
    @DisplayName("409 CONFLICT: 답변 완료(ANSWERED) 질문 수정/삭제 시 409 QNA_CONFLICT 예외를 반환한다")
    void updateOrDeleteAnsweredQuestionThrows409Conflict() {
        // ANSWERED 상태인 privateQuestionUserA 수정 시도
        assertThatThrownBy(() -> qnaService.updateByAuthor(
                privateQuestionUserA.getPublicId(),
                userA,
                "답변 완료 질문 수정",
                "내용",
                QnaCategory.ACCOUNT,
                QnaVisibility.PRIVATE
        )).isInstanceOf(QnaException.class)
                .satisfies(ex -> {
                    QnaException qe = (QnaException) ex;
                    assertThat(qe.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(qe.getErrorCode()).isEqualTo("QNA_CONFLICT");
                });

        // ANSWERED 상태인 privateQuestionUserA 삭제 시도
        assertThatThrownBy(() -> qnaService.deleteByAuthor(
                privateQuestionUserA.getPublicId(),
                userA
        )).isInstanceOf(QnaException.class)
                .satisfies(ex -> {
                    QnaException qe = (QnaException) ex;
                    assertThat(qe.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(qe.getErrorCode()).isEqualTo("QNA_CONFLICT");
                });
    }

    @Test
    @DisplayName("deleteByAuthor: 작성자 본인 삭제 성공 및 타인 삭제 시 403 검증")
    void deleteByAuthorValidation() {
        // 타인 삭제 시 403
        assertThatThrownBy(() -> qnaService.deleteByAuthor(publicQuestionUserA.getPublicId(), userB))
                .isInstanceOf(QnaException.class)
                .hasMessage("질문 삭제 권한이 없습니다.");

        // 본인 삭제 시 성공
        qnaService.deleteByAuthor(publicQuestionUserA.getPublicId(), userA);

        assertThat(qnaQuestionRepository.findByPublicId(publicQuestionUserA.getPublicId())).isEmpty();
    }
}
