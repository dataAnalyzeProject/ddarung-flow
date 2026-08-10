package com.ddarungflow.qna;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

@Disabled("TODO(EXP-BE-1): enable tests one at a time during implementation")
class QnaServiceTest {
    @Test void accountAndLocationQuestionsArePrivate() {}
    @Test void onlyAuthorCanEditOrDelete() {}
    @Test void publicListingExcludesPrivateQuestions() {}
    @Test void administratorAnswerAndHideChangeStatus() {}
}
