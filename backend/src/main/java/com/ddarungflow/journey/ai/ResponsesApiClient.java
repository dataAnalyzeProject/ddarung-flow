package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin Responses API transport. It does not log prompts or responses.
 */
public class ResponsesApiClient {
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
        if (!properties.enabled()) throw new JourneyAiException(JourneyAiErrorCode.AI_DISABLED, "Journey AI is disabled");
        if (!properties.providerConfigured()) throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "Journey AI provider is not configured");
        try {
            HttpRequest request = HttpRequest.newBuilder(properties.responsesUri())
                    .timeout(properties.timeout())
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody(input, schemaName, schema)))
                    .build();
            TransportResponse response = transport.send(request);
            if (response.statusCode() != 200) throw statusError(response.statusCode());
            return extractStructuredOutput(response.body());
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request interrupted", exception);
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request failed", exception);
        }
    }

    JsonNode extractStructuredOutput(String body) {
        try {
            JsonNode response = objectMapper.readTree(body);
            if (response == null || !response.isObject()) throw schemaInvalid("provider response is not an object");
            if ("incomplete".equals(response.path("status").asText())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_RESPONSE_INCOMPLETE, "provider response is incomplete");
            }
            if ("failed".equals(response.path("status").asText())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider response failed");
            }
            if (!"completed".equals(response.path("status").asText())) throw schemaInvalid("provider response is not completed");
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
            if (texts.size() != 1) throw schemaInvalid("provider response must contain exactly one output_text message");
            JsonNode structured = objectMapper.readTree(texts.getFirst());
            if (structured == null) throw schemaInvalid("provider output text is not JSON");
            return structured;
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "provider response is malformed", exception);
        }
    }

    String requestBody(String input, String schemaName, JsonNode schema) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("model", properties.model());
        root.put("input", input);
        root.putObject("reasoning").put("effort", "none");
        ObjectNode format = root.putObject("text").putObject("format");
        format.put("type", "json_schema");
        format.put("name", schemaName);
        format.set("schema", schema);
        return objectMapper.writeValueAsString(root);
    }

    JourneyAiException statusError(int status) {
        String message = status == 429 ? "provider rate limited" : "provider returned " + status;
        return new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, message);
    }

    private JourneyAiException refusal() { return new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_REFUSAL, "provider refused the response"); }
    private JourneyAiException schemaInvalid(String message) { return new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, message); }

    @FunctionalInterface
    interface ResponseTransport {
        TransportResponse send(HttpRequest request) throws Exception;
    }

    record TransportResponse(int statusCode, String body) { }
}
