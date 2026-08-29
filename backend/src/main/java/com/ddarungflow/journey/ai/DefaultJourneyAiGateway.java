package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private final AllowedJourneyTools allowedTools = new AllowedJourneyTools();

    public DefaultJourneyAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper, JsonNode intentSchema) {
        this(properties, objectMapper, intentSchema, new ResponsesApiClient(properties, objectMapper));
    }

    DefaultJourneyAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper, JsonNode intentSchema, ResponsesApiClient client) {
        this.properties = properties;
        this.piiBoundaryValidator = new PiiBoundaryValidator();
        this.intentCompiler = new JourneyIntentCompiler(objectMapper, intentSchema);
        this.client = client;
        this.intentSchema = intentSchema;
        this.wireIntentSchema = new JourneyAiWireSchemaAdapter().adapt(intentSchema);
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
        JsonNode output = client.requestStructuredOutput(request, "journey_intent", wireIntentSchema);
        return new IntentResult(intentCompiler.compile(output.toString()), null);
    }

    @Override
    public List<ToolCallRequest> validateToolPlan(List<ToolCallRequest> requests) {
        return requests.stream().map(allowedTools::validate).toList();
    }
}
