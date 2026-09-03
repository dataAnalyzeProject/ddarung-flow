package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JourneyIntentCompiler {
    private final ObjectMapper objectMapper;
    private final JsonSchemaValidator schemaValidator;
    private final JsonNode intentSchema;

    public JourneyIntentCompiler(ObjectMapper objectMapper) {
        this(objectMapper, JourneyAiSchemas.intent(objectMapper));
    }

    JourneyIntentCompiler(ObjectMapper objectMapper, JsonNode intentSchema) {
        this.objectMapper = objectMapper;
        this.intentSchema = intentSchema;
        this.schemaValidator = new JsonSchemaValidator();
    }

    public JourneyIntent compile(String structuredOutput) {
        JsonNode root;
        try {
            root = objectMapper.readTree(structuredOutput);
        } catch (Exception exception) {
            throw invalid("intent output is not JSON", JourneyAiFailureStage.OUTPUT_TEXT_JSON, exception);
        }
        try {
            if (root == null || !root.isObject()) throw invalid("intent must be a JSON object", JourneyAiFailureStage.CANONICAL_SCHEMA);
            schemaValidator.validate(root, intentSchema);
        } catch (JourneyAiException exception) {
            throw invalid("intent does not match canonical schema", JourneyAiFailureStage.CANONICAL_SCHEMA, exception);
        }
        try {
            List<String> missingFields = strings(root.path("missingFields"), "missingFields");
            boolean clarification = requiredBoolean(root, "needsClarification");
            JourneyIntent intent = new JourneyIntent(
                    optionalPlace(root.path("origin")),
                    optionalPlace(root.path("destination")),
                    optionalTime(root.path("startAt")),
                    optionalPositiveInt(root.path("totalMinutes"), "totalMinutes"),
                    optionalPositiveInt(root.path("requiredBikeCount"), "requiredBikeCount"),
                    integerMap(root.path("preferences"), "preferences"),
                    objectMap(root.path("hardConstraints"), "hardConstraints"),
                    missingFields,
                    clarification
            );
            if (!clarification && (intent.origin() == null || intent.startAt() == null || intent.totalMinutes() == null || intent.requiredBikeCount() == null)) {
                throw invalid("complete intent is missing a required field", JourneyAiFailureStage.SEMANTIC_INTENT);
            }
            return intent;
        } catch (JourneyAiException exception) {
            if (exception.failureStage() != null) throw exception;
            throw invalid("intent semantic validation failed", JourneyAiFailureStage.SEMANTIC_INTENT, exception);
        } catch (Exception exception) {
            throw invalid("intent semantic validation failed", JourneyAiFailureStage.SEMANTIC_INTENT, exception);
        }
    }

    private PlaceReference place(JsonNode node, String field) {
        if (!node.isObject()) throw invalid(field + " must be an object", JourneyAiFailureStage.SEMANTIC_INTENT);
        String query = optionalText(node, "displayName");
        // Model output is a search suggestion, never a provider-verified identifier.
        return query.isBlank() ? null : new PlaceReference(query, "");
    }

    private PlaceReference optionalPlace(JsonNode node) { return node.isNull() || node.isMissingNode() ? null : place(node, "destination"); }
    private OffsetDateTime optionalTime(JsonNode node) { try { return node.isNull() || node.isMissingNode() ? null : OffsetDateTime.parse(node.asText()); } catch (Exception exception) { throw invalid("startAt must be ISO-8601", JourneyAiFailureStage.SEMANTIC_INTENT); } }
    private Integer optionalPositiveInt(JsonNode node, String field) { if (node.isNull() || node.isMissingNode()) return null; if (!node.canConvertToInt() || node.asInt() < 1) throw invalid(field + " must be positive", JourneyAiFailureStage.SEMANTIC_INTENT); return node.asInt(); }
    private boolean requiredBoolean(JsonNode node, String field) { if (!node.has(field) || !node.get(field).isBoolean()) throw invalid(field + " must be boolean", JourneyAiFailureStage.SEMANTIC_INTENT); return node.get(field).asBoolean(); }
    private String optionalText(JsonNode node, String field) { return node.path(field).isTextual() ? node.path(field).asText().trim() : ""; }

    private List<String> strings(JsonNode node, String field) { if (!node.isArray()) throw invalid(field + " must be an array", JourneyAiFailureStage.SEMANTIC_INTENT); List<String> values = new ArrayList<>(); for (JsonNode value : node) { if (!value.isTextual()) throw invalid(field + " values must be strings", JourneyAiFailureStage.SEMANTIC_INTENT); values.add(value.asText()); } return values; }
    private Map<String, Integer> integerMap(JsonNode node, String field) { if (!node.isObject()) throw invalid(field + " must be an object", JourneyAiFailureStage.SEMANTIC_INTENT); Map<String, Integer> values = new LinkedHashMap<>(); Iterator<Map.Entry<String, JsonNode>> fields = node.fields(); while (fields.hasNext()) { Map.Entry<String, JsonNode> entry = fields.next(); if (!entry.getValue().canConvertToInt()) throw invalid(field + " values must be integers", JourneyAiFailureStage.SEMANTIC_INTENT); values.put(entry.getKey(), entry.getValue().asInt()); } return values; }
    private Map<String, Object> objectMap(JsonNode node, String field) { if (!node.isObject()) throw invalid(field + " must be an object", JourneyAiFailureStage.SEMANTIC_INTENT); return objectMapper.convertValue(node, Map.class); }
    private JourneyAiException invalid(String message, JourneyAiFailureStage stage) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message, stage); }
    private JourneyAiException invalid(String message, JourneyAiFailureStage stage, Throwable cause) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message, cause, stage); }
}
