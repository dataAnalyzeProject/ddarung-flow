package com.ddarungflow.journey.returnprediction;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

class ReturnPredictionClientTest {
    private static final OffsetDateTime AS_OF = OffsetDateTime.parse("2026-08-28T18:20:00+09:00");
    private static final OffsetDateTime TARGET = OffsetDateTime.parse("2026-08-28T19:00:00+09:00");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-28T09:25:00Z"), ZoneOffset.UTC);

    @Test void featureFlagOffDoesNotCallProvider() {
        ReturnPredictionClient client = client(RestClient.builder(), false);
        assertThat(client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.FEATURE_DISABLED);
        assertThat(client.health(new HealthRequest())).isEqualTo(new HealthResponse("DISABLED", "UNAVAILABLE", false));
    }

    @Test void healthKeepsRunningSeparateFromModelReadiness() {
        Fixture fixture = fixture();
        fixture.server.expect(once(), requestTo("http://return/health")).andExpect(method(GET))
                .andRespond(success("{\"serviceStatus\":\"RUNNING\",\"modelStatus\":\"UNAVAILABLE\",\"ready\":false}"));
        assertThat(fixture.client.health(new HealthRequest())).isEqualTo(new HealthResponse("RUNNING", "UNAVAILABLE", false));
        fixture.server.verify();
    }

    @Test void normalPredictionSupportsEveryRequiredDockCount() {
        for (int count = 1; count <= 5; count++) {
            Fixture fixture = fixture();
            fixture.server.expect(once(), requestTo("http://return/predict")).andExpect(method(POST)).andRespond(success(normal(count)));
            ReturnPredictionResult result = fixture.client.predict(request(count));
            assertThat(result.status()).as("%s", result).isEqualTo(ReturnPredictionResult.Status.NORMAL);
            assertThat(result.selectedProbability()).isEqualTo(new double[]{.90, .76, .58, .37, .19}[count - 1]);
            fixture.server.verify();
        }
    }

    @Test void modelNotConfiguredIsDistinctFallback() {
        Fixture fixture = fixture();
        fixture.server.expect(requestTo("http://return/predict")).andRespond(response(SERVICE_UNAVAILABLE, "{\"status\":\"UNAVAILABLE\",\"errorCode\":\"MODEL_NOT_CONFIGURED\"}"));
        assertThat(fixture.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.MODEL_NOT_CONFIGURED);
    }

    @Test void transportFailuresAreTyped() {
        Fixture timeout = fixture();
        timeout.server.expect(requestTo("http://return/predict")).andRespond(req -> { throw new ResourceAccessException("timeout", new SocketTimeoutException()); });
        assertThat(timeout.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.TIMEOUT);
        Fixture connection = fixture();
        connection.server.expect(requestTo("http://return/predict")).andRespond(req -> { throw new ResourceAccessException("connection", new ConnectException()); });
        assertThat(connection.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.CONNECTION_FAILURE);
    }

    @Test void providerAndInvalidRequestAreTyped() {
        Fixture provider = fixture();
        provider.server.expect(requestTo("http://return/predict")).andRespond(response(INTERNAL_SERVER_ERROR, "{}"));
        assertThat(provider.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.PROVIDER_FAILURE);
        Fixture invalid = fixture();
        invalid.server.expect(requestTo("http://return/predict")).andRespond(response(org.springframework.http.HttpStatus.BAD_REQUEST, "{}"));
        assertThat(invalid.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.INVALID_REQUEST);
    }

    @Test void malformedResponseAndAllProbabilityContractFailuresDoNotInventProbability() {
        assertFailure("{", ReturnPredictionResult.Failure.MALFORMED_RESPONSE);
        assertFailure(normal(2).replace("0.90", "1.01"), ReturnPredictionResult.Failure.PROBABILITY_RANGE_VIOLATION);
        assertFailure(normal(2).replace("0.76", "0.95"), ReturnPredictionResult.Failure.MONOTONICITY_VIOLATION);
        assertFailure(normal(2).replace("\"selectedProbability\":0.76", "\"selectedProbability\":0.75"), ReturnPredictionResult.Failure.SELECTED_PROBABILITY_MISMATCH);
    }

    @Test void missingAndUnavailableNeverCarryZeroProbability() {
        Fixture missing = fixture();
        missing.server.expect(requestTo("http://return/predict")).andRespond(success("{\"status\":\"MISSING\",\"featureAsOf\":\"2026-08-28T18:20:00+09:00\",\"predictionTargetAt\":\"2026-08-28T19:00:00+09:00\"}"));
        ReturnPredictionResult result = missing.client.predict(request(2));
        assertThat(result.status()).as("%s", result).isEqualTo(ReturnPredictionResult.Status.MISSING);
        assertThat(result.selectedProbability()).isNull();
        assertThat(result.probabilities()).isNull();
    }

    @Test void staleResponseIsUnavailable() {
        Fixture fixture = fixture();
        fixture.server.expect(requestTo("http://return/predict")).andRespond(success(normal(2).replace("2026-08-28T18:20:00+09:00", "2026-08-28T17:00:00+09:00")));
        assertThat(fixture.client.predict(request(2)).failure()).isEqualTo(ReturnPredictionResult.Failure.STALE_RESPONSE);
    }

    private void assertFailure(String body, ReturnPredictionResult.Failure expected) {
        Fixture fixture = fixture();
        fixture.server.expect(requestTo("http://return/predict")).andRespond(success(body));
        ReturnPredictionResult result = fixture.client.predict(request(2));
        assertThat(result.failure()).as("%s", result).isEqualTo(expected);
        assertThat(result.selectedProbability()).isNull();
    }

    private static PredictRequest request(int required) { return new PredictRequest("ST-1", AS_OF, TARGET, null, 40, required, 5, 20); }
    private static String normal(int required) { return "{\"stationId\":\"ST-1\",\"featureAsOf\":\"2026-08-28T18:20:00+09:00\",\"arrivalAt\":\"2026-08-28T19:00:00+09:00\",\"predictionTargetAt\":\"2026-08-28T19:00:00+09:00\",\"requiredEmptyDockCount\":" + required + ",\"selectedProbability\":" + new double[]{.90, .76, .58, .37, .19}[required - 1] + ",\"probabilities\":{\"atLeast1\":0.90,\"atLeast2\":0.76,\"atLeast3\":0.58,\"atLeast4\":0.37,\"atLeast5\":0.19},\"status\":\"NORMAL\",\"modelVersion\":\"return-v1\",\"dataQuality\":\"SUFFICIENT\"}"; }
    private static org.springframework.test.web.client.response.DefaultResponseCreator success(String body) { return withSuccess(body, MediaType.APPLICATION_JSON); }
    private static org.springframework.test.web.client.response.DefaultResponseCreator response(org.springframework.http.HttpStatusCode status, String body) { return withStatus(status).contentType(MediaType.APPLICATION_JSON).body(body); }
    private static ReturnPredictionClient client(RestClient.Builder builder, boolean enabled) { return new ReturnPredictionClient(builder.build(), new ReturnPredictionProperties(enabled, "http://return", java.time.Duration.ofSeconds(1), java.time.Duration.ofMinutes(15)), CLOCK); }
    private static Fixture fixture() { RestClient.Builder builder = RestClient.builder().baseUrl("http://return"); MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build(); return new Fixture(client(builder, true), server); }
    private record Fixture(ReturnPredictionClient client, MockRestServiceServer server) { }
}
