package com.ddarungflow.journey.returnprediction;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.SocketTimeoutException;
import java.time.Clock;

public final class ReturnPredictionClient implements ReturnPredictionPort {
    private final ReturnPredictionProperties properties;
    private final RestClient client;
    private final ReturnPredictionResponseValidator validator;

    public ReturnPredictionClient(RestClient.Builder builder, ReturnPredictionProperties properties) {
        this(builder.baseUrl(properties.baseUrl()).build(), properties, Clock.systemUTC());
    }

    ReturnPredictionClient(RestClient client, ReturnPredictionProperties properties, Clock clock) {
        this.client = client;
        this.properties = properties;
        this.validator = new ReturnPredictionResponseValidator(clock, properties.maxResponseAge());
    }

    @Override public HealthResponse health(HealthRequest request) {
        if (!properties.enabled()) return new HealthResponse("DISABLED", "UNAVAILABLE", false);
        try {
            HealthResponse response = client.get().uri("/health").retrieve().body(HealthResponse.class);
            if (response == null || !"RUNNING".equals(response.serviceStatus()) || response.modelStatus() == null
                    || response.ready() != "READY".equals(response.modelStatus())) return new HealthResponse("UNAVAILABLE", "UNAVAILABLE", false);
            return response;
        } catch (RestClientException ignored) {
            return new HealthResponse("UNAVAILABLE", "UNAVAILABLE", false);
        }
    }

    @Override public ReturnPredictionResult predict(PredictRequest request) {
        if (!properties.enabled()) return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.FEATURE_DISABLED);
        if (request == null || request.invalidField() != null) return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.INVALID_REQUEST);
        try {
            PredictResponse response = client.post().uri("/predict").body(request).retrieve().body(PredictResponse.class);
            ReturnPredictionResult.Failure invalid = validator.validate(request, response);
            if (invalid != null) return ReturnPredictionResult.unavailable(invalid);
            if ("MISSING".equals(response.status())) return ReturnPredictionResult.missing(response.featureAsOf(), response.predictionTargetAt(), response.modelVersion(), response.dataQuality());
            if (!"NORMAL".equals(response.status())) return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.MALFORMED_RESPONSE);
            return new ReturnPredictionResult(ReturnPredictionResult.Status.NORMAL, null, response.selectedProbability(), response.probabilities(), response.featureAsOf(), response.predictionTargetAt(), response.modelVersion(), response.dataQuality());
        } catch (RestClientResponseException error) {
            return mapHttp(error.getStatusCode(), error.getResponseBodyAsString());
        } catch (ResourceAccessException error) {
            return ReturnPredictionResult.unavailable(hasCause(error, SocketTimeoutException.class) ? ReturnPredictionResult.Failure.TIMEOUT : ReturnPredictionResult.Failure.CONNECTION_FAILURE);
        } catch (RestClientException error) {
            return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.MALFORMED_RESPONSE);
        }
    }

    private ReturnPredictionResult mapHttp(HttpStatusCode status, String body) {
        if (status.value() == 503 && body != null && body.contains("MODEL_NOT_CONFIGURED")) return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.MODEL_NOT_CONFIGURED);
        if (status.is4xxClientError()) return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.INVALID_REQUEST);
        return ReturnPredictionResult.unavailable(ReturnPredictionResult.Failure.PROVIDER_FAILURE);
    }

    private static boolean hasCause(Throwable error, Class<? extends Throwable> expected) {
        for (Throwable current = error; current != null; current = current.getCause()) if (expected.isInstance(current)) return true;
        return false;
    }
}
