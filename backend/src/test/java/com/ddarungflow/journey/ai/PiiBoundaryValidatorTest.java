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

    @Test
    void doesNotTreatTheTowardsPostpositionAsARoadNameFollowedByANumber() {
        // "쪽으로"/"이쪽으로" ("towards") end in the same "로" character real road names
        // (테헤란로, 강남대로, ...) do, and a following duration/count digit ("2시간", "3시간") looked
        // exactly like a detailed street number to the old pattern. Real road names never have "으"
        // immediately before "로", so this must keep being blocked correctly while these ordinary
        // directional phrases stop being misidentified as an address.
        assertThatCode(() -> validator.rejectSensitiveInput(
                "성수에서 따릉이를 빌려 한강 쪽으로 2시간 정도 라이딩하고 카페도 들르고 싶어요")).doesNotThrowAnyException();
        assertThatCode(() -> validator.rejectSensitiveInput("이쪽으로 3시간만 더 가면 돼요")).doesNotThrowAnyException();
        assertBlocked("테헤란로 152에서 만나요");
        assertBlocked("강남대로 456번지 근처");
    }

    private void assertBlocked(String input) {
        assertThatThrownBy(() -> validator.rejectSensitiveInput(input))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_PII_BLOCKED);
    }
}
