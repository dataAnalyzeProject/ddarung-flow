package com.ddarungflow.ridingguide;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.JsonSchemaValidator;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiProperties;
import com.ddarungflow.journey.ai.ResponsesApiClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class DefaultRidingGuideAiGateway implements RidingGuideAiGateway {
    private static final String INSTRUCTIONS = """
            Return only a riding guide JSON object matching the supplied schema.
            The evidence bundle is authoritative. Never invent or change evidence IDs, POIs, probabilities,
            inventory, weather, air-quality, route values, sources, statuses, or timestamps.
            Select only supplied POI IDs. Keep the preview short and stayMinutes between 10 and 120.
            Every numeric fact mentioned must be copied exactly into factRefs and factValues.
            guideSummary and rationales must be concise and must not add unsupported factual claims.
            """;

    private final ObjectMapper objectMapper;
    private final ResponsesApiClient client;
    private final JsonNode schema;
    private final JsonSchemaValidator schemaValidator = new JsonSchemaValidator();

    @Autowired
    public DefaultRidingGuideAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper) {
        this(objectMapper, new ResponsesApiClient(properties, objectMapper));
    }

    DefaultRidingGuideAiGateway(ObjectMapper objectMapper, ResponsesApiClient client) {
        this.objectMapper = objectMapper;
        this.client = client;
        this.schema = schema(objectMapper);
    }

    @Override
    public GuideOutput generate(ConsumerAiEvidenceBundle evidence) {
        ObjectNode input = objectMapper.createObjectNode();
        input.set("evidence", objectMapper.valueToTree(evidence));
        input.putObject("constraints").put("minimumStayMinutes", 10).put("maximumStayMinutes", 120);
        JsonNode output = client.requestStructuredOutput(input, INSTRUCTIONS, "riding_guide", schema);
        schemaValidator.validate(output, schema);
        try {
            return objectMapper.treeToValue(output, GuideOutput.class);
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID,
                    "riding guide output cannot be parsed", exception);
        }
    }

    private static JsonNode schema(ObjectMapper objectMapper) {
        try {
            return objectMapper.readTree("""
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
                        "factRefs":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["type","evidenceId","factName"],"properties":{"type":{"type":"string","enum":["RENTAL_CANDIDATE","POI","ROUTE","WEATHER","AIR_QUALITY"]},"evidenceId":{"type":"string"},"factName":{"type":"string"}}}},
                        "factValues":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["reference","value"],"properties":{"reference":{"type":"object","additionalProperties":false,"required":["type","evidenceId","factName"],"properties":{"type":{"type":"string","enum":["RENTAL_CANDIDATE","POI","ROUTE","WEATHER","AIR_QUALITY"]},"evidenceId":{"type":"string"},"factName":{"type":"string"}}},"value":{"type":"number"}}}},
                        "rationale":{"type":"string"},
                        "rationaleTags":{"type":"array","items":{"type":"string"}}
                      }
                    }
                    """);
        } catch (Exception exception) {
            throw new IllegalStateException("riding guide schema cannot be created", exception);
        }
    }
}
