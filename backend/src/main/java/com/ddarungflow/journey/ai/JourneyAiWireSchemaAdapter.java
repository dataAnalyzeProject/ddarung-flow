package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** Produces a provider-safe copy without weakening the checked-in canonical schema. */
public final class JourneyAiWireSchemaAdapter {
    public JsonNode adapt(JsonNode canonicalSchema) {
        JsonNode wire = canonicalSchema.deepCopy();
        normalize(wire);
        return wire;
    }

    private void normalize(JsonNode node) {
        if (node.isArray()) {
            for (JsonNode child : node) normalize(child);
            return;
        }
        if (!node.isObject()) return;
        ObjectNode object = (ObjectNode) node;
        object.remove("$schema");
        object.remove("format");
        object.fields().forEachRemaining(entry -> normalize(entry.getValue()));
        if (!object.path("type").isArray() || !containsNull(object.path("type"))) return;

        ObjectNode nonNullSchema = object.deepCopy();
        ArrayNode types = (ArrayNode) nonNullSchema.remove("type");
        ArrayNode alternatives = object.arrayNode();
        for (JsonNode type : types) {
            if ("null".equals(type.asText())) {
                alternatives.addObject().put("type", "null");
            } else {
                ObjectNode alternative = nonNullSchema.deepCopy();
                alternative.put("type", type.asText());
                alternatives.add(alternative);
            }
        }
        object.removeAll();
        object.set("anyOf", alternatives);
    }

    private boolean containsNull(JsonNode types) {
        for (JsonNode type : types) if ("null".equals(type.asText())) return true;
        return false;
    }
}
