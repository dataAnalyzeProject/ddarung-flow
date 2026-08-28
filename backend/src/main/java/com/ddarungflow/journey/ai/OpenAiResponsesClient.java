package com.ddarungflow.journey.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * Thin Responses API transport. It does not log prompts or responses, and is not wired until E0.
 */
public class OpenAiResponsesClient {
    private final JourneyAiProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OpenAiResponsesClient(JourneyAiProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder().connectTimeout(properties.timeout()).build());
    }

    OpenAiResponsesClient(JourneyAiProperties properties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
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
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw statusError(response.statusCode());
            JsonNode parsed = objectMapper.readTree(response.body());
            JsonNode text = parsed.path("output").path(0).path("content").path(0).path("text");
            if (!text.isTextual()) throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID, "provider response has no structured output");
            return objectMapper.readTree(text.asText());
        } catch (JourneyAiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request interrupted", exception);
        } catch (Exception exception) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, "provider request failed", exception);
        }
    }

    String requestBody(String input, String schemaName, JsonNode schema) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("model", properties.model());
        root.put("store", false);
        root.put("input", input);
        ObjectNode format = root.putObject("text").putObject("format");
        format.put("type", "json_schema");
        format.put("name", schemaName);
        format.put("strict", true);
        format.set("schema", schema);
        return objectMapper.writeValueAsString(root);
    }

    JourneyAiException statusError(int status) {
        String message = status == 429 ? "provider rate limited" : "provider returned " + status;
        return new JourneyAiException(JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE, message);
    }
}
