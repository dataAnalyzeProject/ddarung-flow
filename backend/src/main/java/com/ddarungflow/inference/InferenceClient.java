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
        this.predictUri = URI.create(baseUrl.replaceAll("/+$", "") + "/predict");
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public InferenceDtos.PredictResponse predict(List<InferenceDtos.CandidateRequest> candidates) {
        if (candidates == null || candidates.isEmpty() || candidates.size() > 5) {
            throw new IllegalArgumentException("inference candidates must contain between 1 and 5 items");
        }
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
}
