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

    public JourneyIntentCompiler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JourneyIntent compile(String structuredOutput) {
        try {
            JsonNode root = objectMapper.readTree(structuredOutput);
            if (root == null || !root.isObject()) throw invalid("intent must be a JSON object");
            List<String> missingFields = strings(root.path("missingFields"), "missingFields");
            boolean clarification = requiredBoolean(root, "needsClarification");
            JourneyIntent intent = new JourneyIntent(
                    place(root.path("origin"), "origin"),
                    optionalPlace(root.path("destination")),
                    optionalTime(root.path("startAt")),
                    optionalPositiveInt(root.path("totalMinutes"), "totalMinutes"),
                    optionalPositiveInt(root.path("requiredBikeCount"), "requiredBikeCount"),
                    integerMap(root.path("preferences"), "preferences"),
                    objectMap(root.path("hardConstraints"), "hardConstraints"),
                    missingFields,
                    clarification
            );
            if (!clarification && (intent.origin().displayName().isBlank() || intent.startAt() == null || intent.totalMinutes() == null || intent.requiredBikeCount() == null)) {
                throw invalid("complete intent is missing a required field");
            }
            return intent;
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "intent output is invalid", exception);
        }
    }

    private PlaceReference place(JsonNode node, String field) {
        if (!node.isObject()) throw invalid(field + " must be an object");
        return new PlaceReference(requiredText(node, "displayName"), optionalText(node, "placeId"));
    }

    private PlaceReference optionalPlace(JsonNode node) { return node.isNull() || node.isMissingNode() ? null : place(node, "destination"); }
    private OffsetDateTime optionalTime(JsonNode node) { try { return node.isNull() || node.isMissingNode() ? null : OffsetDateTime.parse(node.asText()); } catch (Exception exception) { throw invalid("startAt must be ISO-8601"); } }
    private Integer optionalPositiveInt(JsonNode node, String field) { if (node.isNull() || node.isMissingNode()) return null; if (!node.canConvertToInt() || node.asInt() < 1) throw invalid(field + " must be positive"); return node.asInt(); }
    private boolean requiredBoolean(JsonNode node, String field) { if (!node.has(field) || !node.get(field).isBoolean()) throw invalid(field + " must be boolean"); return node.get(field).asBoolean(); }
    private String requiredText(JsonNode node, String field) { String value = optionalText(node, field); if (value.isBlank()) throw invalid(field + " is required"); return value; }
    private String optionalText(JsonNode node, String field) { return node.path(field).isTextual() ? node.path(field).asText().trim() : ""; }

    private List<String> strings(JsonNode node, String field) { if (!node.isArray()) throw invalid(field + " must be an array"); List<String> values = new ArrayList<>(); for (JsonNode value : node) { if (!value.isTextual()) throw invalid(field + " values must be strings"); values.add(value.asText()); } return values; }
    private Map<String, Integer> integerMap(JsonNode node, String field) { if (!node.isObject()) throw invalid(field + " must be an object"); Map<String, Integer> values = new LinkedHashMap<>(); Iterator<Map.Entry<String, JsonNode>> fields = node.fields(); while (fields.hasNext()) { Map.Entry<String, JsonNode> entry = fields.next(); if (!entry.getValue().canConvertToInt()) throw invalid(field + " values must be integers"); values.put(entry.getKey(), entry.getValue().asInt()); } return values; }
    private Map<String, Object> objectMap(JsonNode node, String field) { if (!node.isObject()) throw invalid(field + " must be an object"); return objectMapper.convertValue(node, Map.class); }
    private JourneyAiException invalid(String message) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message); }
}
