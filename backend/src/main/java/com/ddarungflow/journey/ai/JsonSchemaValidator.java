package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/** Validates the JSON Schema subset used by the checked-in D0 Structured Output schemas. */
public final class JsonSchemaValidator {
    public void validate(JsonNode value, JsonNode schema) {
        if (schema == null || !schema.isObject()) fail("schema is missing");
        validateType(value, schema.path("type"));
        if (schema.has("enum") && !contains(schema.path("enum"), value)) fail("value is not allowed");
        if (value.isObject()) validateObject(value, schema);
        if (value.isArray() && schema.has("items")) for (JsonNode item : value) validate(item, schema.path("items"));
        if (value.isIntegralNumber()) validateRange(value.asLong(), schema);
        if (value.isTextual() && "date-time".equals(schema.path("format").asText()) && !value.asText().isBlank()) validateDateTime(value.asText());
    }

    private void validateObject(JsonNode value, JsonNode schema) {
        Set<String> required = new HashSet<>();
        for (JsonNode name : schema.path("required")) required.add(name.asText());
        if (!value.fieldNames().hasNext() && !required.isEmpty()) fail("required object fields are missing");
        for (String name : required) if (!value.has(name)) fail("required field is missing");
        JsonNode properties = schema.path("properties");
        Iterator<String> names = value.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!properties.has(name) && !schema.path("additionalProperties").asBoolean(true)) fail("additional field is not allowed");
            if (properties.has(name)) validate(value.path(name), properties.path(name));
        }
    }

    private void validateType(JsonNode value, JsonNode expected) {
        if (expected.isMissingNode()) return;
        if (expected.isTextual() && matches(value, expected.asText())) return;
        if (expected.isArray()) for (JsonNode type : expected) if (matches(value, type.asText())) return;
        fail("value does not match schema type");
    }

    private boolean matches(JsonNode value, String type) {
        return switch (type) {
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            case "string" -> value.isTextual();
            case "integer" -> value.isIntegralNumber();
            case "number" -> value.isNumber();
            case "boolean" -> value.isBoolean();
            case "null" -> value.isNull();
            default -> false;
        };
    }

    private boolean contains(JsonNode values, JsonNode value) { for (JsonNode candidate : values) if (candidate.equals(value)) return true; return false; }
    private void validateRange(long value, JsonNode schema) { if (schema.has("minimum") && value < schema.path("minimum").asLong()) fail("value is below minimum"); if (schema.has("maximum") && value > schema.path("maximum").asLong()) fail("value is above maximum"); }
    private void validateDateTime(String value) { try { OffsetDateTime.parse(value); } catch (Exception exception) { fail("value is not date-time"); } }
    private void fail(String message) { throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message); }
}
