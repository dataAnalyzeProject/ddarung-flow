package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JourneyIntentCompilerTest {
    private final JourneyIntentCompiler compiler = new JourneyIntentCompiler(new ObjectMapper());

    @Test
    void compilesCompleteIntent() {
        JourneyIntent result = compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":4,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """);

        assertThat(result.origin().displayName()).isEqualTo("성수역");
        assertThat(result.requiredBikeCount()).isEqualTo(2);
    }

    @Test
    void keepsMissingFieldsForClarificationInsteadOfInventingValues() {
        JourneyIntent result = compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":null,"totalMinutes":null,"requiredBikeCount":null,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":["startAt"],"needsClarification":true}
                """);

        assertThat(result.needsClarification()).isTrue();
        assertThat(result.startAt()).isNull();
    }

    @Test
    void rejectsOutOfRangeBikeCountAndMalformedOutput() {
        assertThatThrownBy(() -> compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":6,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
        assertThatThrownBy(() -> compiler.compile("not-json"))
                .isInstanceOf(JourneyAiException.class);
        assertThatThrownBy(() -> compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A"},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"needsClarification":false}
                """))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }

    @Test
    void rejectsAdditionalFieldsThroughTheCheckedInJsonSchema() {
        assertThatThrownBy(() -> compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A","latitude":37},"destination":null,"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """))
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }
}
