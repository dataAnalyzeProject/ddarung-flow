package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/**
 * E0 may instantiate and wire this adapter. D0 keeps it independent from JourneyPlanService.
 */
public class DefaultJourneyAiGateway implements JourneyAiGateway {
    private final JourneyAiProperties properties;
    private final PiiBoundaryValidator piiBoundaryValidator;
    private final JourneyIntentCompiler intentCompiler;
    private final ResponsesApiClient client;
    private final JsonNode intentSchema;
    private final JsonNode wireIntentSchema;
    private final ObjectMapper objectMapper;
    private final JsonNode scheduleSchema;
    private final JsonSchemaValidator schemaValidator = new JsonSchemaValidator();
    private final AllowedJourneyTools allowedTools = new AllowedJourneyTools();

    public DefaultJourneyAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper, JsonNode intentSchema) {
        this(properties, objectMapper, intentSchema, new ResponsesApiClient(properties, objectMapper));
    }

    DefaultJourneyAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper, JsonNode intentSchema, ResponsesApiClient client) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.piiBoundaryValidator = new PiiBoundaryValidator();
        this.intentCompiler = new JourneyIntentCompiler(objectMapper, intentSchema);
        this.client = client;
        this.intentSchema = intentSchema;
        this.wireIntentSchema = new JourneyAiWireSchemaAdapter().adapt(intentSchema);
        this.scheduleSchema = scheduleSchema(objectMapper);
    }

    @Override
    public IntentResult compileIntent(String input) {
        return compileIntent(new JourneyCompileRequest(input, null, null, null, null, null));
    }

    @Override
    public IntentResult compileIntent(JourneyCompileRequest request) {
        if (!properties.enabled()) return IntentResult.unavailable(JourneyAiErrorCode.AI_DISABLED);
        if (!properties.providerConfigured()) return IntentResult.unavailable(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        piiBoundaryValidator.rejectSensitiveInput(request.naturalLanguageText());
        return client.requestStructuredOutput(request, "journey_intent", wireIntentSchema,
                output -> new IntentResult(intentCompiler.compile(output.toString()), null));
    }

    @Override
    public List<ToolCallRequest> validateToolPlan(List<ToolCallRequest> requests) {
        return requests.stream().map(allowedTools::validate).toList();
    }

    @Override
    public ScheduleResult selectSchedule(ConsumerAiEvidenceBundle evidence, ScheduleConstraints constraints) {
        if (!properties.enabled()) return ScheduleResult.unavailable(JourneyAiErrorCode.AI_DISABLED);
        if (!properties.providerConfigured()) return ScheduleResult.unavailable(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE);
        ObjectNode input = objectMapper.createObjectNode();
        input.set("evidence", objectMapper.valueToTree(evidence));
        input.set("constraints", objectMapper.valueToTree(constraints));
        return client.requestStructuredOutput(input, """
                Return only a schedule selection matching the supplied schema.
                The evidence bundle is authoritative. Select only existing rental, POI, route, weather,
                and air-quality evidence IDs. Route IDs must form the exact ordered bicycle chain for
                the selected POI stops. Never invent or rewrite probability, inventory, distance,
                duration, timestamps, route geometry, weather, or air-quality facts. Keep stay minutes
                and stop count within the supplied constraints. Numeric facts may only be copied exactly
                through factRefs and factValues.
                Each evidence entry separates its fields into a textFacts object and a numericFacts
                object. factRefs and factValues may ONLY reference a factName that exists in that
                entry's numericFacts — never a factName that only exists in textFacts (for example
                availabilityLevel, predictionStatus, inventoryStatus, and other qualitative labels are
                text facts, not numeric facts, and must never appear in factRefs/factValues or be
                assigned an invented numeric value). Describe text facts only in qualitative rationale
                prose, never as a number.
                The rationale must be plain qualitative prose explaining the choice in words only —
                it must not contain any digit characters (0-9). Never state a count, distance, duration,
                percentage, or other number in the rationale text itself; reference such facts only
                through factRefs and factValues. For example, prefer "충분한 대여 가능성과 짧은 접근 거리"
                over any phrasing that writes out a number.
                """, "journey_schedule", scheduleSchema, this::parseSchedule);
    }

    private ScheduleResult parseSchedule(JsonNode output) {
        try {
            schemaValidator.validate(output, scheduleSchema);
            return new ScheduleResult(objectMapper.treeToValue(output, EvidenceSelectionValidator.Selection.class), null);
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID,
                    "journey schedule output cannot be parsed", JourneyAiFailureStage.CANONICAL_SCHEMA);
        }
    }

    private static JsonNode scheduleSchema(ObjectMapper objectMapper) {
        try {
            return objectMapper.readTree("""
                    {
                      "type":"object","additionalProperties":false,
                      "required":["rentalCandidateId","stops","routeEvidenceIds","weatherEvidenceIds","airQualityEvidenceIds","factRefs","factValues","rationale","rationaleTags"],
                      "properties":{
                        "rentalCandidateId":{"type":"string"},
                        "stops":{"type":"array","maxItems":3,"items":{"type":"object","additionalProperties":false,"required":["poiId","stayMinutes"],"properties":{"poiId":{"type":"string"},"stayMinutes":{"type":"integer","minimum":10,"maximum":120}}}},
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
            throw new IllegalStateException("journey schedule schema cannot be created", exception);
        }
    }
}
