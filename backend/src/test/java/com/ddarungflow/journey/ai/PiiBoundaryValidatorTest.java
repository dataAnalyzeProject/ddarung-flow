package com.ddarungflow.journey.ai;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PiiBoundaryValidatorTest {
    private final PiiBoundaryValidator validator = new PiiBoundaryValidator();

    @Test
    void permitsResolvedPlaceAliasesOnly() {
        assertThatCode(() -> validator.rejectSensitiveInput("ORIGIN_A에서 카페가 있는 코스")).doesNotThrowAnyException();
    }

    @Test
    void blocksEmailPhoneCoordinatesAndPersonalLabelsBeforeProviderUse() {
        assertBlocked("name@example.com에서 출발");
        assertBlocked("010-1234-5678로 알려줘");
        assertBlocked("37.544, 127.055에서 출발");
        assertBlocked("집에서 출발");
    }

    private void assertBlocked(String input) {
        assertThatThrownBy(() -> validator.rejectSensitiveInput(input))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PII_BLOCKED);
    }
}
