package com.ddarungflow.inference;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public class InferenceClient {
    private static final List<Integer> SUPPORTED_HORIZONS = List.of(60, 120, 180, 240);
    private static final List<Integer> SUPPORTED_QUANTITIES = List.of(1, 2, 3, 4, 5);

    private final URI predictUri;
    private final URI runtimeModelUri;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Clock clock;

    @Autowired
    public InferenceClient(
        @Value("${inference.base-url:http://inference:8081}") String baseUrl,
        ObjectMapper objectMapper
    ) {
        this(baseUrl, objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(), Clock.systemUTC());
    }

    InferenceClient(String baseUrl, ObjectMapper objectMapper, HttpClient httpClient) {
        this(baseUrl, objectMapper, httpClient, Clock.systemUTC());
    }

    InferenceClient(String baseUrl, ObjectMapper objectMapper, HttpClient httpClient, Clock clock) {
        String normalizedBaseUrl = baseUrl.replaceAll("/+$", "");
        this.predictUri = URI.create(normalizedBaseUrl + "/predict");
        this.runtimeModelUri = URI.create(normalizedBaseUrl + "/internal/runtime-model");
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.clock = clock;
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
            InferenceDtos.RuntimeModelResponse runtimeModel = runtimeModel();
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
                throw new InvalidInferenceResponseException("inference response is unavailable");
            }
            validatePredictResponse(candidates, parsed, runtimeModel);
            return parsed;
        } catch (InvalidInferenceResponseException exception) {
            throw exception;
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
                throw new InvalidInferenceResponseException("inference runtime response is invalid");
            }
            return parsed;
        } catch (InvalidInferenceResponseException exception) {
            throw exception;
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
            && SUPPORTED_HORIZONS.equals(response.supportedHorizons())
            && SUPPORTED_QUANTITIES.equals(response.supportedQuantities());
    }

    private void validatePredictResponse(
        List<InferenceDtos.CandidateRequest> candidates,
        InferenceDtos.PredictResponse response,
        InferenceDtos.RuntimeModelResponse runtimeModel
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (response.errorCode() != null
            || response.modelVersion() == null || response.modelVersion().isBlank()
            || !response.modelVersion().equals(runtimeModel.modelVersion())
            || response.generatedAt() == null || response.generatedAt().isAfter(now)
            || response.generatedAt().isBefore(runtimeModel.loadedAt())
            || response.predictions().size() != candidates.size()) {
            throw new InvalidInferenceResponseException("inference response metadata is invalid");
        }

        Set<String> requestedStationIds = new HashSet<>();
        Set<String> requestedStationNumbers = new HashSet<>();
        for (InferenceDtos.CandidateRequest candidate : candidates) {
            if (candidate == null
                || candidate.stationId() == null || candidate.stationId().isBlank()
                || candidate.stationNumber() == null || candidate.stationNumber().isBlank()
                || !requestedStationIds.add(candidate.stationId())
                || !requestedStationNumbers.add(candidate.stationNumber())
                || candidate.featureAsOf() == null
                || response.generatedAt().isBefore(candidate.featureAsOf())) {
                throw new InvalidInferenceResponseException("inference request identity or freshness is invalid");
            }
        }

        Set<String> responseStationIds = new HashSet<>();
        for (InferenceDtos.CandidatePrediction prediction : response.predictions()) {
            if (prediction == null
                || prediction.stationId() == null
                || !requestedStationIds.contains(prediction.stationId())
                || !responseStationIds.add(prediction.stationId())) {
                throw new InvalidInferenceResponseException("inference response station identity is invalid");
            }
            if ("NORMAL".equals(prediction.status())) {
                validateProbabilityRows(prediction.rows());
            } else if (("MISSING".equals(prediction.status()) || "UNAVAILABLE".equals(prediction.status()))
                && prediction.rows() != null && prediction.rows().isEmpty()) {
                continue;
            } else {
                throw new InvalidInferenceResponseException("inference candidate status is invalid");
            }
        }
        if (!responseStationIds.equals(requestedStationIds)) {
            throw new InvalidInferenceResponseException("inference response candidate set is invalid");
        }
    }

    private void validateProbabilityRows(List<InferenceDtos.ProbabilityRow> rows) {
        if (rows == null || rows.size() != SUPPORTED_HORIZONS.size() * SUPPORTED_QUANTITIES.size()) {
            throw new InvalidInferenceResponseException("inference response probability rows are incomplete");
        }

        Set<ProbabilityKey> keys = new HashSet<>();
        for (InferenceDtos.ProbabilityRow row : rows) {
            if (row == null
                || !SUPPORTED_HORIZONS.contains(row.horizonMinutes())
                || !SUPPORTED_QUANTITIES.contains(row.requiredBikeCount())
                || !keys.add(new ProbabilityKey(row.horizonMinutes(), row.requiredBikeCount()))
                || row.probability() == null
                || row.probability().compareTo(BigDecimal.ZERO) < 0
                || row.probability().compareTo(BigDecimal.ONE) > 0) {
                throw new InvalidInferenceResponseException("inference response probability row is invalid");
            }
        }

        for (int horizon : SUPPORTED_HORIZONS) {
            BigDecimal previous = null;
            for (int quantity : SUPPORTED_QUANTITIES) {
                BigDecimal current = rows.stream()
                    .filter(row -> row.horizonMinutes() == horizon && row.requiredBikeCount() == quantity)
                    .findFirst()
                    .orElseThrow()
                    .probability();
                if (previous != null && previous.compareTo(current) < 0) {
                    throw new InvalidInferenceResponseException("inference response quantity probabilities are not monotonic");
                }
                previous = current;
            }
        }
    }

    private record ProbabilityKey(int horizonMinutes, int requiredBikeCount) {}

    public static final class InvalidInferenceResponseException extends IllegalArgumentException {
        InvalidInferenceResponseException(String message) {
            super(message);
        }
    }
}
