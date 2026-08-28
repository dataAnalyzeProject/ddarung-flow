package com.ddarungflow.journey.ai;

import java.util.Map;

/** D0 only carries validated tool requests and results; E0 will execute the actual tools. */
public record ToolCallResult(String callId, String toolName, Map<String, Object> facts) {
    public ToolCallResult {
        facts = facts == null ? Map.of() : Map.copyOf(facts);
    }
}
