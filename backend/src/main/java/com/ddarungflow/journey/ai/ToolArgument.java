package com.ddarungflow.journey.ai;

import java.util.List;

public record ToolArgument(String name, ToolArgumentType type, Object value) {
    public ToolArgument {
        if (name == null || name.isBlank() || type == null || !matches(type, value)) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_ARGUMENT_INVALID, "tool argument type is invalid");
        }
        if (value instanceof List<?> values) value = List.copyOf(values);
    }

    private static boolean matches(ToolArgumentType type, Object value) {
        return switch (type) {
            case STRING -> value instanceof String;
            case INTEGER -> value instanceof Integer || value instanceof Long;
            case BOOLEAN -> value instanceof Boolean;
            case STRING_ARRAY -> value instanceof List<?> values && values.stream().allMatch(String.class::isInstance);
        };
    }
}
