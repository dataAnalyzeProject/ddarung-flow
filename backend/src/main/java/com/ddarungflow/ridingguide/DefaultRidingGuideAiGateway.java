package com.ddarungflow.ridingguide;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.JsonSchemaValidator;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiProperties;
import com.ddarungflow.journey.ai.ResponsesApiClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class DefaultRidingGuideAiGateway implements RidingGuideAiGateway {
    private static final String INSTRUCTIONS = """
            Return only a riding guide JSON object matching the supplied schema.
            The evidence bundle is authoritative. Never invent or change evidence IDs, POIs, probabilities,
            inventory, weather, air-quality, route values, sources, statuses, or timestamps.
            Every selected evidence ID must be an exact map key from the matching evidence map.
            Never use raw stationId or placeId text facts as evidence IDs.
            Keep the preview short and stayMinutes between 10 and 120.
            guideSummary, rationale, every stop rationale, and every rationaleTags item must contain no numeric characters.
            Numbers are allowed only in the structured stayMinutes fields.
            Return factRefs and factValues as empty arrays.
            Keep all free text concise and do not add unsupported factual claims.
            """;

    private final ObjectMapper objectMapper;
    private final ResponsesApiClient client;
    private final JsonSchemaValidator schemaValidator = new JsonSchemaValidator();

    @Autowired
    public DefaultRidingGuideAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper) {
        this(objectMapper, new ResponsesApiClient(properties, objectMapper));
    }

    DefaultRidingGuideAiGateway(ObjectMapper objectMapper, ResponsesApiClient client) {
        this.objectMapper = objectMapper;
        this.client = client;
    }

    @Override
    public GuideOutput generate(ConsumerAiEvidenceBundle evidence) {
        ObjectNode input = objectMapper.createObjectNode();
        input.set("evidence", objectMapper.valueToTree(evidence));
        input.putObject("constraints").put("minimumStayMinutes", 10).put("maximumStayMinutes", 120);
        JsonNode schema = schema(objectMapper, evidence);
        JsonNode output = client.requestStructuredOutput(input, INSTRUCTIONS, "riding_guide", schema);
        schemaValidator.validate(output, schema);
        try {
            return objectMapper.treeToValue(output, GuideOutput.class);
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID,
                    "riding guide output cannot be parsed", exception);
        }
    }

    static JsonNode schema(ObjectMapper objectMapper, ConsumerAiEvidenceBundle evidence) {
        if (evidence == null || evidence.rentalCandidates() == null || evidence.rentalCandidates().isEmpty()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH,
                    "rental evidence is required");
        }
        try {
            ObjectNode schema = (ObjectNode) objectMapper.readTree("""
                    {
                      "type":"object","additionalProperties":false,
                      "required":["guideSummary","rentalCandidateId","stops","routeEvidenceIds","weatherEvidenceIds","airQualityEvidenceIds","factRefs","factValues","rationale","rationaleTags"],
                      "properties":{
                        "guideSummary":{"type":"string"},
                        "rentalCandidateId":{"type":"string"},
                        "stops":{"type":"array","maxItems":3,"items":{"type":"object","additionalProperties":false,"required":["poiId","stayMinutes","rationale"],"properties":{"poiId":{"type":"string"},"stayMinutes":{"type":"integer","minimum":10,"maximum":120},"rationale":{"type":"string"}}}},
                        "routeEvidenceIds":{"type":"array","items":{"type":"string"}},
                        "weatherEvidenceIds":{"type":"array","items":{"type":"string"}},
                        "airQualityEvidenceIds":{"type":"array","items":{"type":"string"}},
                        "factRefs":{"type":"array","maxItems":0,"items":{"type":"object","additionalProperties":false,"required":["type","evidenceId","factName"],"properties":{"type":{"type":"string","enum":["RENTAL_CANDIDATE","POI","ROUTE","WEATHER","AIR_QUALITY"]},"evidenceId":{"type":"string"},"factName":{"type":"string"}}}},
                        "factValues":{"type":"array","maxItems":0,"items":{"type":"object","additionalProperties":false,"required":["reference","value"],"properties":{"reference":{"type":"object","additionalProperties":false,"required":["type","evidenceId","factName"],"properties":{"type":{"type":"string","enum":["RENTAL_CANDIDATE","POI","ROUTE","WEATHER","AIR_QUALITY"]},"evidenceId":{"type":"string"},"factName":{"type":"string"}}},"value":{"type":"number"}}}},
                        "rationale":{"type":"string"},
                        "rationaleTags":{"type":"array","items":{"type":"string"}}
                      }
                    }
                    """);
            ObjectNode properties = (ObjectNode) schema.path("properties");
            setEnum((ObjectNode) properties.path("rentalCandidateId"), evidence.rentalCandidates(), objectMapper);
            setArrayEnum((ObjectNode) properties.path("stops"), "poiId", evidence.pois(), objectMapper);
            setArrayEnum((ObjectNode) properties.path("routeEvidenceIds"), null, evidence.routes(), objectMapper);
            setArrayEnum((ObjectNode) properties.path("weatherEvidenceIds"), null, evidence.weather(), objectMapper);
            setArrayEnum((ObjectNode) properties.path("airQualityEvidenceIds"), null, evidence.airQuality(), objectMapper);
            return schema;
        } catch (Exception exception) {
            throw new IllegalStateException("riding guide schema cannot be created", exception);
        }
    }

    private static void setArrayEnum(
            ObjectNode arraySchema,
            String objectProperty,
            java.util.Map<String, ConsumerAiEvidenceBundle.Evidence> evidence,
            ObjectMapper objectMapper
    ) {
        if (evidence == null || evidence.isEmpty()) {
            arraySchema.put("maxItems", 0);
            return;
        }
        ObjectNode itemSchema = objectProperty == null
                ? (ObjectNode) arraySchema.path("items")
                : (ObjectNode) arraySchema.path("items").path("properties").path(objectProperty);
        setEnum(itemSchema, evidence, objectMapper);
    }

    private static void setEnum(
            ObjectNode stringSchema,
            java.util.Map<String, ConsumerAiEvidenceBundle.Evidence> evidence,
            ObjectMapper objectMapper
    ) {
        ArrayNode allowed = objectMapper.createArrayNode();
        evidence.keySet().stream().sorted().forEach(allowed::add);
        stringSchema.set("enum", allowed);
    }
}
