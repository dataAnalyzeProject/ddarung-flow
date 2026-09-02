package com.ddarungflow.ridingguide;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.ResponsesApiClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DefaultRidingGuideAiGatewayTest {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final ResponsesApiClient client = mock(ResponsesApiClient.class);
    private final DefaultRidingGuideAiGateway gateway = new DefaultRidingGuideAiGateway(mapper, client);

    @Test
    void sendsOnlyServerEvidenceAndParsesStrictGuideShape() throws Exception {
        when(client.requestStructuredOutput(any(JsonNode.class), anyString(), anyString(), any(JsonNode.class)))
                .thenReturn(mapper.readTree("""
                        {"guideSummary":"근거 요약","rentalCandidateId":"rental:ST-4",
                         "stops":[{"poiId":"poi:POI-1","stayMinutes":30,"rationale":"실제 장소"}],
                         "routeEvidenceIds":[],"weatherEvidenceIds":[],"airQualityEvidenceIds":[],
                         "factRefs":[],"factValues":[],"rationale":"근거","rationaleTags":[]}
                        """));

        RidingGuideAiGateway.GuideOutput output = gateway.generate(evidence());

        assertThat(output.rentalCandidateId()).isEqualTo("rental:ST-4");
        assertThat(output.stops()).singleElement().extracting(RidingGuideAiGateway.StopOutput::poiId)
                .isEqualTo("poi:POI-1");
        ArgumentCaptor<JsonNode> input = ArgumentCaptor.forClass(JsonNode.class);
        verify(client).requestStructuredOutput(input.capture(), anyString(), anyString(), any(JsonNode.class));
        assertThat(input.getValue().path("evidence").path("rentalCandidates").has("rental:ST-4")).isTrue();
        assertThat(input.getValue().toString()).doesNotContain("userId", "cookie", "Authorization");
    }

    @Test
    void rejectsAdditionalProviderFieldsBeforeTheyReachTheService() throws Exception {
        when(client.requestStructuredOutput(any(JsonNode.class), anyString(), anyString(), any(JsonNode.class)))
                .thenReturn(mapper.readTree("""
                        {"guideSummary":"근거 요약","rentalCandidateId":"rental:ST-4","stops":[],
                         "routeEvidenceIds":[],"weatherEvidenceIds":[],"airQualityEvidenceIds":[],
                         "factRefs":[],"factValues":[],"rationale":"근거","rationaleTags":[],
                         "inventedProbability":0.99}
                        """));

        assertThatThrownBy(() -> gateway.generate(evidence()))
                .isInstanceOf(JourneyAiException.class)
                .extracting(exception -> ((JourneyAiException) exception).code())
                .isEqualTo(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID);
    }

    private ConsumerAiEvidenceBundle evidence() {
        ConsumerAiEvidenceBundle.Evidence rental = new ConsumerAiEvidenceBundle.Evidence(
                "rental:ST-4", "core-on-demand-prediction", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                OffsetDateTime.parse("2026-09-02T15:00:00+09:00"), Map.of("stationId", "ST-4"),
                Map.of("rentalProbability", new BigDecimal("0.82")));
        ConsumerAiEvidenceBundle.Evidence poi = new ConsumerAiEvidenceBundle.Evidence(
                "poi:POI-1", "kakao-local", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                null, Map.of("placeId", "POI-1"), Map.of());
        return new ConsumerAiEvidenceBundle(
                Map.of("rental:ST-4", rental), Map.of("poi:POI-1", poi), Map.of(), Map.of(), Map.of());
    }
}
