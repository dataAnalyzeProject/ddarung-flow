package com.ddarungflow.inference;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

@Component
public class InferenceClient {
    private final URI predictUri;
    private final URI runtimeModelUri;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public InferenceClient(
        @Value("${inference.base-url:http://inference:8081}") String baseUrl,
        ObjectMapper objectMapper
    ) {
        this(baseUrl, objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
    }

    InferenceClient(String baseUrl, ObjectMapper objectMapper, HttpClient httpClient) {
        String normalizedBaseUrl = baseUrl.replaceAll("/+$", "");
        this.predictUri = URI.create(normalizedBaseUrl + "/predict");
        this.runtimeModelUri = URI.create(normalizedBaseUrl + "/internal/runtime-model");
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public InferenceDtos.PredictResponse predict(List<InferenceDtos.CandidateRequest> candidates) {
        if (candidates == null || candidates.isEmpty() || candidates.size() > 5) {
            throw new IllegalArgumentException("inference candidates must contain between 1 and 5 items");
        }
        return requestPredictions(candidates);
    }

    /** Admin scopes are chunked by the caller; this method deliberately cannot exceed one 20-item request. */
    public InferenceDtos.PredictResponse predictAdminChunk(List<InferenceDtos.CandidateRequest> candidates) {
        if (candidates == null || candidates.isEmpty() || candidates.size() > 20) {
            throw new IllegalArgumentException("admin inference candidates must contain between 1 and 20 items");
        }
        return requestPredictions(candidates);
    }

    private InferenceDtos.PredictResponse requestPredictions(List<InferenceDtos.CandidateRequest> candidates) {
        try {
            String body = objectMapper.writeValueAsString(new InferenceDtos.PredictRequest(candidates));
            HttpRequest request = HttpRequest.newBuilder(predictUri)
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalStateException("inference returned a non-200 response");
            }
            InferenceDtos.PredictResponse parsed = objectMapper.readValue(response.body(), InferenceDtos.PredictResponse.class);
            if (parsed == null || !"NORMAL".equals(parsed.status()) || parsed.predictions() == null) {
                throw new IllegalStateException("inference response is unavailable");
            }
            return parsed;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("inference request was interrupted", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("inference request failed", exception);
        }
    }

    public InferenceDtos.RuntimeModelResponse runtimeModel() {
        try {
            HttpRequest request = HttpRequest.newBuilder(runtimeModelUri)
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalStateException("inference runtime returned a non-200 response");
            }
            InferenceDtos.RuntimeModelResponse parsed = objectMapper.readValue(response.body(), InferenceDtos.RuntimeModelResponse.class);
            if (!validRuntimeModel(parsed)) {
                throw new IllegalStateException("inference runtime response is invalid");
            }
            return parsed;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("inference runtime request was interrupted", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("inference runtime request failed", exception);
        }
    }

    private boolean validRuntimeModel(InferenceDtos.RuntimeModelResponse response) {
        return response != null
            && "NORMAL".equals(response.status())
            && response.modelVersion() != null && !response.modelVersion().isBlank()
            && response.artifactSha256() != null && response.artifactSha256().matches("[0-9a-f]{64}")
            && response.modelSource() != null && response.modelSource().matches("[a-z_]+")
            && response.loadedAt() != null
            && List.of(60, 120, 180, 240).equals(response.supportedHorizons())
            && List.of(1, 2, 3, 4, 5).equals(response.supportedQuantities());
    }
}
