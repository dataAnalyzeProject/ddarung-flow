package com.ddarungflow.journey.ai;

/** Safe diagnostic categories; never attach provider or prompt payloads to these values. */
public enum JourneyAiFailureStage {
    RESPONSE_ENVELOPE,
    OUTPUT_TEXT_JSON,
    CANONICAL_SCHEMA,
    SEMANTIC_INTENT
}
