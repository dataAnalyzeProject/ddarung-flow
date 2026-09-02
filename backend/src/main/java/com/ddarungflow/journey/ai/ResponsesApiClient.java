package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.OffsetDateTime;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin Responses API transport. It does not log prompts or responses.
 */
public class ResponsesApiClient {
    private static final Logger log = LoggerFactory.getLogger(ResponsesApiClient.class);
    private static final String JOURNEY_INTENT_INSTRUCTIONS = "Return only a JourneyIntent JSON object matching the supplied schema. "
            + "Use selected place references, departureAt, and requiredBikeCount from the input as authoritative. "
            + "Do not invent or change placeId values. Use maxJourneyMinutes when no explicit duration is given.";
    private final JourneyAiProperties properties;
    private final ObjectMapper objectMapper;
    private final ResponseTransport transport;

    public ResponsesApiClient(JourneyAiProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, defaultTransport(properties));
    }

    private static ResponseTransport defaultTransport(JourneyAiProperties properties) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(properties.timeout()).build();
        return request -> {
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return new TransportResponse(response.statusCode(), response.body());
        };
    }

    ResponsesApiClient(JourneyAiProperties properties, ObjectMapper objectMapper, ResponseTransport transport) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.transport = transport;
    }

    public JsonNode requestStructuredOutput(String input, String schemaName, JsonNode schema) {
        return requestStructuredOutput(new JourneyCompileRequest(input, null, null, null, null, null), schemaName, schema);
    }

    public JsonNode requestStructuredOutput(JourneyCompileRequest input, String schemaName, JsonNode schema) {
        return requestStructuredOutput(() -> requestBody(input, schemaName, schema));
    }

    public JsonNode requestStructuredOutput(JsonNode input, String instructions, String schemaName, JsonNode schema) {
        return requestStructuredOutput(() -> requestBody(input, instructions, schemaName, schema));
    }

    private JsonNode requestStructuredOutput(RequestBodySupplier requestBodySupplier) {
        if (!properties.enabled()) throw new JourneyAiException(JourneyAiErrorCode.AI_DISABLED, "Journey AI is disabled");
        if (!properties.providerConfigured()) throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "Journey AI provider is not configured");
        boolean requestAttempted = false;
        try {
            HttpRequest request = HttpRequest.newBuilder(properties.responsesUri())
                    .timeout(properties.timeout())
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBodySupplier.get()))
                    .build();
            requestAttempted = true;
            log.info("event=journey_ai_provider_request attempted=true");
            TransportResponse response = transport.send(request);
            log.info("event=journey_ai_provider_response status={}", response.statusCode());
            if (response.statusCode() != 200) throw statusError(response.statusCode());
            return extractStructuredOutput(response.body());
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (requestAttempted) log.warn("event=journey_ai_provider_transport_failure category=INTERRUPTED");
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request interrupted", exception);
        } catch (Exception exception) {
            if (requestAttempted) log.warn("event=journey_ai_provider_transport_failure category=REQUEST_FAILURE");
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request failed", exception);
        }
    }

    JsonNode extractStructuredOutput(String body) {
        JsonNode response;
        try {
            response = objectMapper.readTree(body);
        } catch (Exception exception) {
            throw schemaInvalid("provider response is malformed", JourneyAiFailureStage.RESPONSE_ENVELOPE, exception);
        }
        try {
            if (response == null || !response.isObject()) throw schemaInvalid("provider response is not an object", JourneyAiFailureStage.RESPONSE_ENVELOPE);
            if ("incomplete".equals(response.path("status").asText())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_RESPONSE_INCOMPLETE, "provider response is incomplete");
            }
            if ("failed".equals(response.path("status").asText())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider response failed");
            }
            if (!"completed".equals(response.path("status").asText())) throw schemaInvalid("provider response is not completed", JourneyAiFailureStage.RESPONSE_ENVELOPE);
            List<String> texts = new ArrayList<>();
            for (JsonNode output : response.path("output")) {
                if ("reasoning".equals(output.path("type").asText())) continue;
                if ("refusal".equals(output.path("type").asText())) throw refusal();
                if (!"message".equals(output.path("type").asText())) continue;
                for (JsonNode content : output.path("content")) {
                    if ("refusal".equals(content.path("type").asText())) throw refusal();
                    if ("output_text".equals(content.path("type").asText()) && content.path("text").isTextual()) texts.add(content.path("text").asText());
                }
            }
            if (texts.size() != 1) throw schemaInvalid("provider response must contain exactly one output_text message", JourneyAiFailureStage.RESPONSE_ENVELOPE);
            return parseOutputText(texts.getFirst());
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw schemaInvalid("provider response is malformed", JourneyAiFailureStage.RESPONSE_ENVELOPE, exception);
        }
    }

    String requestBody(String input, String schemaName, JsonNode schema) throws Exception {
        return requestBody(new JourneyCompileRequest(input, null, null, null, null, null), schemaName, schema);
    }

    String requestBody(JourneyCompileRequest input, String schemaName, JsonNode schema) throws Exception {
        return requestBody(compileInput(input), JOURNEY_INTENT_INSTRUCTIONS, schemaName, schema);
    }

    String requestBody(JsonNode input, String instructions, String schemaName, JsonNode schema) throws Exception {
        if (input == null || instructions == null || instructions.isBlank()) {
            throw new IllegalArgumentException("structured output input and instructions are required");
        }
        return requestBody(objectMapper.writeValueAsString(input), instructions, schemaName, schema);
    }

    private String requestBody(String input, String instructions, String schemaName, JsonNode schema) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("model", properties.model());
        root.put("instructions", instructions);
        root.put("input", input);
        root.putObject("reasoning").put("effort", "none");
        ObjectNode format = root.putObject("text").putObject("format");
        format.put("type", "json_schema");
        format.put("name", schemaName);
        format.set("schema", schema);
        return objectMapper.writeValueAsString(root);
    }

    private JsonNode parseOutputText(String outputText) {
        try {
            JsonNode structured = objectMapper.readTree(outputText);
            if (structured == null) throw schemaInvalid("provider output text is not JSON", JourneyAiFailureStage.OUTPUT_TEXT_JSON);
            return structured;
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw schemaInvalid("provider output text is not JSON", JourneyAiFailureStage.OUTPUT_TEXT_JSON, exception);
        }
    }

    private String compileInput(JourneyCompileRequest request) throws Exception {
        ObjectNode input = objectMapper.createObjectNode();
        input.put("naturalLanguageText", request.naturalLanguageText());
        putPlace(input, "origin", request.origin());
        putPlace(input, "destination", request.destination());
        putTime(input, request.departureAt());
        if (request.maxJourneyMinutes() != null) input.put("maxJourneyMinutes", request.maxJourneyMinutes());
        if (request.requiredBikeCount() != null) input.put("requiredBikeCount", request.requiredBikeCount());
        return objectMapper.writeValueAsString(input);
    }

    private void putPlace(ObjectNode input, String field, PlaceReference place) {
        if (place == null) {
            input.putNull(field);
            return;
        }
        ObjectNode node = input.putObject(field);
        node.put("displayName", place.displayName());
        node.put("placeId", place.placeId());
    }

    private void putTime(ObjectNode input, OffsetDateTime departureAt) {
        if (departureAt == null) input.putNull("departureAt");
        else input.put("departureAt", departureAt.toString());
    }

    JourneyAiException statusError(int status) {
        String message = status == 429 ? "provider rate limited" : "provider returned " + status;
        return new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, message);
    }

    private JourneyAiException refusal() { return new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_REFUSAL, "provider refused the response"); }
    private JourneyAiException schemaInvalid(String message, JourneyAiFailureStage stage) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message, stage); }
    private JourneyAiException schemaInvalid(String message, JourneyAiFailureStage stage, Throwable cause) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message, cause, stage); }

    @FunctionalInterface
    interface ResponseTransport {
        TransportResponse send(HttpRequest request) throws Exception;
    }

    @FunctionalInterface
    private interface RequestBodySupplier {
        String get() throws Exception;
    }

    record TransportResponse(int statusCode, String body) { }
}
