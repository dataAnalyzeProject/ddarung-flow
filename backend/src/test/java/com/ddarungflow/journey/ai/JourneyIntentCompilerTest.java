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
        assertThat(result.origin().placeId()).isEmpty();
        assertThat(result.requiredBikeCount()).isEqualTo(2);
    }

    @Test
    void treatsModelPlaceIdsAsUnverifiedQueriesForBothPlaces() {
        JourneyIntent result = compiler.compile("""
                {"origin":{"displayName":"성수역","placeId":"fabricated-origin"},"destination":{"displayName":"서울숲","placeId":"fabricated-destination"},"startAt":"2026-08-28T18:30:00+09:00","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """);

        assertThat(result.origin()).isEqualTo(new PlaceReference("성수역", ""));
        assertThat(result.destination()).isEqualTo(new PlaceReference("서울숲", ""));
    }

    @Test
    void allowsMissingOrBlankOriginOnlyAsAnIncompleteDraft() {
        for (String origin : java.util.List.of("null", "{\"displayName\":\" \",\"placeId\":\"fabricated-id\"}")) {
            String draft = """
                    {"origin":%s,"destination":null,"startAt":null,"totalMinutes":null,"requiredBikeCount":null,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":["origin","startAt","totalMinutes","requiredBikeCount"],"needsClarification":true}
                    """.formatted(origin);
            JourneyIntent result = compiler.compile(draft);

            assertThat(result.origin()).isNull();
            assertThat(result.startAt()).isNull();
            assertThat(result.totalMinutes()).isNull();
            assertThat(result.requiredBikeCount()).isNull();
            assertThat(result.needsClarification()).isTrue();
            assertThat(result.missingFields()).containsExactly("origin", "startAt", "totalMinutes", "requiredBikeCount");
            assertStage(draft.replace("\"needsClarification\":true", "\"needsClarification\":false"), JourneyAiFailureStage.SEMANTIC_INTENT);
        }
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

    @Test
    void separatesOutputJsonCanonicalSchemaAndSemanticFailureStages() {
        assertStage("not-json", JourneyAiFailureStage.OUTPUT_TEXT_JSON);
        assertStage("""
                {"origin":{"displayName":"성수역","placeId":"ORIGIN_A","latitude":37},"destination":null,"startAt":"not-a-date","totalMinutes":60,"requiredBikeCount":2,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """, JourneyAiFailureStage.CANONICAL_SCHEMA);
        assertStage("""
                {"origin":{"displayName":"","placeId":"ORIGIN_A"},"destination":null,"startAt":null,"totalMinutes":null,"requiredBikeCount":null,"preferences":{"stability":3,"lowSlope":3,"bikeLane":3,"scenery":3,"culture":3,"cafe":3,"avoidCrowds":3},"hardConstraints":{"maxWalkMinutes":null,"avoidRain":null,"returnBy":null},"missingFields":[],"needsClarification":false}
                """, JourneyAiFailureStage.SEMANTIC_INTENT);
    }

    private void assertStage(String output, JourneyAiFailureStage expected) {
        assertThatThrownBy(() -> compiler.compile(output))
                .satisfies(exception -> {
                    JourneyAiException journeyException = (JourneyAiException) exception;
                    assertThat(journeyException.code()).isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
                    assertThat(journeyException.failureStage()).isEqualTo(expected);
                });
    }
}
