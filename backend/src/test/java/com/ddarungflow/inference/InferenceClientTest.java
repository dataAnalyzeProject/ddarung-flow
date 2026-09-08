package com.ddarungflow.inference;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class InferenceClientTest {

    private static final String MODEL_VERSION = "hist_gradient_boosting@2f2ece729fd4";
    private static final OffsetDateTime FEATURE_AS_OF = OffsetDateTime.now()
        .minusHours(1)
        .truncatedTo(ChronoUnit.HOURS);

    @Test
    @DisplayName("정확한 candidate identity와 H1-H4 x 수량 1-5 응답을 수용한다")
    void acceptsCompleteFreshResponseFromCurrentRuntimeModel() throws Exception {
        InferenceDtos.PredictResponse response = client(body -> {}, runtime -> {}).predict(request());

        assertThat(response.modelVersion()).isEqualTo(MODEL_VERSION);
        assertThat(response.predictions()).singleElement()
            .satisfies(prediction -> assertThat(prediction.rows()).hasSize(20));
    }

    @Test
    @DisplayName("중복 candidate나 중복 horizon/quantity 행을 거부한다")
    void rejectsDuplicateCandidateAndProbabilityRow() throws Exception {
        assertRejected(body -> predictions(body).add(new LinkedHashMap<>(predictions(body).getFirst())));
        assertRejected(body -> {
            List<Map<String, Object>> rows = rows(body);
            rows.set(rows.size() - 1, new LinkedHashMap<>(rows.getFirst()));
        });
    }

    @Test
    @DisplayName("요청에 없는 station identity를 거부한다")
    void rejectsWrongStationIdentity() throws Exception {
        InferenceClient client = client(
            body -> predictions(body).getFirst().put("stationId", "ST-WRONG"),
            runtime -> {}
        );

        assertThatThrownBy(() -> client.predict(request()))
            .isExactlyInstanceOf(InferenceClient.InvalidInferenceResponseException.class);
    }

    @Test
    @DisplayName("수량 행이나 H1-H4 horizon이 하나라도 빠진 응답을 거부한다")
    void rejectsMissingQuantityOrHorizon() throws Exception {
        assertRejected(body -> rows(body).removeIf(row ->
            row.get("horizonMinutes").equals(240) && row.get("requiredBikeCount").equals(5)
        ));
        assertRejected(body -> rows(body).removeIf(row -> row.get("horizonMinutes").equals(240)));
    }

    @Test
    @DisplayName("NaN, Infinity, 음수, 1 초과 확률을 모두 거부한다")
    void rejectsNonFiniteAndOutOfRangeProbabilities() throws Exception {
        for (Object invalid : List.of(Double.NaN, Double.POSITIVE_INFINITY, new BigDecimal("-0.01"), new BigDecimal("1.01"))) {
            assertRejected(body -> rows(body).getFirst().put("probability", invalid));
        }
    }

    @Test
    @DisplayName("수량이 늘 때 확률이 증가하는 응답을 거부한다")
    void rejectsQuantityMonotonicityViolation() throws Exception {
        assertRejected(body -> rows(body).get(1).put("probability", new BigDecimal("0.90")));
    }

    @Test
    @DisplayName("featureAsOf보다 오래됐거나 현재시각보다 미래인 generatedAt을 거부한다")
    void rejectsStaleOrFutureResponse() throws Exception {
        assertRejected(body -> body.put("generatedAt", FEATURE_AS_OF.minusSeconds(1).toString()));
        assertRejected(body -> body.put("generatedAt", OffsetDateTime.now().plusHours(1).toString()));
    }

    @Test
    @DisplayName("현재 runtime model이 load되기 전의 generatedAt을 거부한다")
    void rejectsResponseOlderThanCurrentRuntimeModel() throws Exception {
        InferenceClient client = client(
            body -> body.put("generatedAt", FEATURE_AS_OF.plusMinutes(1).toString()),
            runtime -> runtime.put("loadedAt", FEATURE_AS_OF.plusMinutes(2).toString())
        );

        assertThatThrownBy(() -> client.predict(request()))
            .isExactlyInstanceOf(InferenceClient.InvalidInferenceResponseException.class);
    }

    @Test
    @DisplayName("유효하지 않은 runtime model identity를 거부한다")
    void rejectsInvalidRuntimeModelIdentity() throws Exception {
        InferenceClient client = client(body -> {}, runtime -> runtime.put("artifactSha256", "not-a-sha256"));

        assertThatThrownBy(() -> client.predict(request()))
            .isExactlyInstanceOf(InferenceClient.InvalidInferenceResponseException.class);
    }

    @Test
    @DisplayName("runtime HTTP 실패는 semantic validation 예외로 바꾸지 않는다")
    void keepsRuntimeHttpFailureRetryable() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        HttpClient httpClient = Mockito.mock(HttpClient.class);
        HttpResponse<String> unavailable = response(503, "");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(unavailable);
        InferenceClient client = new InferenceClient("http://inference.test", objectMapper, httpClient);

        assertThatThrownBy(() -> client.predict(request()))
            .isExactlyInstanceOf(IllegalStateException.class)
            .isNotInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("runtime model과 다른 predict modelVersion을 거부한다")
    void rejectsWrongModelVersion() throws Exception {
        assertRejected(body -> body.put("modelVersion", "another-model-version"));
    }

    private void assertRejected(Consumer<Map<String, Object>> mutation) throws Exception {
        InferenceClient client = client(mutation, runtime -> {});
        assertThatThrownBy(() -> client.predict(request())).isInstanceOf(RuntimeException.class);
    }

    private InferenceClient client(
        Consumer<Map<String, Object>> predictMutation,
        Consumer<Map<String, Object>> runtimeMutation
    ) throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        Map<String, Object> predictBody = validPredictBody();
        Map<String, Object> runtimeBody = validRuntimeBody();
        predictMutation.accept(predictBody);
        runtimeMutation.accept(runtimeBody);

        HttpClient httpClient = Mockito.mock(HttpClient.class);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenAnswer(invocation -> {
                HttpRequest request = invocation.getArgument(0);
                String body = request.uri().getPath().endsWith("runtime-model")
                    ? objectMapper.writeValueAsString(runtimeBody)
                    : objectMapper.writeValueAsString(predictBody);
                return response(body);
            });
        return new InferenceClient("http://inference.test", objectMapper, httpClient);
    }

    private static List<InferenceDtos.CandidateRequest> request() {
        return List.of(new InferenceDtos.CandidateRequest("ST-4", "00102", 11, FEATURE_AS_OF));
    }

    private static Map<String, Object> validPredictBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "NORMAL");
        body.put("errorCode", null);
        body.put("modelVersion", MODEL_VERSION);
        body.put("generatedAt", OffsetDateTime.now().minusSeconds(1).toString());

        List<Map<String, Object>> probabilityRows = new ArrayList<>();
        for (int horizon : List.of(60, 120, 180, 240)) {
            for (int quantity = 1; quantity <= 5; quantity++) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("horizonMinutes", horizon);
                row.put("requiredBikeCount", quantity);
                row.put("probability", new BigDecimal("0.90").subtract(new BigDecimal("0.10").multiply(BigDecimal.valueOf(quantity))));
                probabilityRows.add(row);
            }
        }
        Map<String, Object> prediction = new LinkedHashMap<>();
        prediction.put("stationId", "ST-4");
        prediction.put("status", "NORMAL");
        prediction.put("rows", probabilityRows);
        body.put("predictions", new ArrayList<>(List.of(prediction)));
        return body;
    }

    private static Map<String, Object> validRuntimeBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "NORMAL");
        body.put("modelVersion", MODEL_VERSION);
        body.put("artifactSha256", "a".repeat(64));
        body.put("modelSource", "local_verified");
        body.put("loadedAt", OffsetDateTime.now().minusMinutes(1).toString());
        body.put("supportedHorizons", List.of(60, 120, 180, 240));
        body.put("supportedQuantities", List.of(1, 2, 3, 4, 5));
        return body;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> predictions(Map<String, Object> body) {
        return (List<Map<String, Object>>) body.get("predictions");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> body) {
        return (List<Map<String, Object>>) predictions(body).getFirst().get("rows");
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<String> response(String body) {
        return response(200, body);
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<String> response(int statusCode, String body) {
        HttpResponse<String> response = Mockito.mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(statusCode);
        when(response.body()).thenReturn(body);
        return response;
    }
}
