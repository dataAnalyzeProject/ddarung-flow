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
    void blocksEmailPhoneCoordinatesDetailedAddressesAndPersonalLabelsBeforeProviderUse() {
        assertBlocked("name@example.com에서 출발");
        assertBlocked("010-1234-5678로 알려줘");
        assertBlocked("37.544, 127.055에서 출발");
        assertBlocked("집에서 출발");
        assertBlocked("성수이로 12길 3에서 출발");
        assertBlocked("서울숲푸르지오 101동 1203호에서 출발");
        assertBlocked("성수동 123번지 101호");
        assertBlocked("OO아파트 103동 502호");
    }

    @Test
    void doesNotTreatRestaurantAsThePersonalHomeLabel() {
        assertThatCode(() -> validator.rejectSensitiveInput("성수 맛집을 포함한 코스")).doesNotThrowAnyException();
        assertThatCode(() -> validator.rejectSensitiveInput("서울숲 근처 카페")).doesNotThrowAnyException();
        assertThatCode(() -> validator.rejectSensitiveInput("ORIGIN_A에서 출발")).doesNotThrowAnyException();
    }

    private void assertBlocked(String input) {
        assertThatThrownBy(() -> validator.rejectSensitiveInput(input))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PII_BLOCKED);
    }
}
