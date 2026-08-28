package com.ddarungflow.journey.ai;

import java.util.Map;

public record ToolCallRequest(String callId, String toolName, Map<String, Object> arguments) {
    public ToolCallRequest {
        if (callId == null || callId.isBlank() || toolName == null || toolName.isBlank()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID, "tool call id and name are required");
        }
        arguments = arguments == null ? Map.of() : Map.copyOf(arguments);
    }
}
