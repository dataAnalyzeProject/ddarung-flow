package com.ddarungflow.journey.integration;

import com.ddarungflow.journey.ai.DefaultJourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyAiProperties;
import com.ddarungflow.journey.ai.JourneyAiSchemas;
import com.ddarungflow.journey.returnprediction.ReturnPredictionClient;
import com.ddarungflow.journey.returnprediction.ReturnPredictionPort;
import com.ddarungflow.journey.returnprediction.ReturnPredictionProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Duration;

@Configuration
public class JourneyIntegrationConfiguration {

    @Bean
    JourneyAiProperties journeyAiProperties(
            @Value("${journey.ai.enabled:false}") boolean enabled,
            @Value("${journey.ai.responses-uri:https://api.deepseek.com/responses}") URI responsesUri,
            @Value("${journey.ai.api-key:}") String apiKey,
            @Value("${journey.ai.model:deepseek-v4-flash}") String model,
            @Value("${journey.ai.timeout:10s}") Duration timeout) {
        return new JourneyAiProperties(enabled, responsesUri, apiKey, model, timeout);
    }

    @Bean
    JsonNode journeyIntentSchema(ObjectMapper objectMapper) {
        return JourneyAiSchemas.intent(objectMapper);
    }

    @Bean
    JourneyAiGateway journeyAiGateway(JourneyAiProperties properties, ObjectMapper objectMapper, JsonNode journeyIntentSchema) {
        return new DefaultJourneyAiGateway(properties, objectMapper, journeyIntentSchema);
    }

    @Bean
    ReturnPredictionProperties returnPredictionProperties(
            @Value("${journey.return-prediction.enabled:false}") boolean enabled,
            @Value("${journey.return-prediction.base-url:http://return-inference:8082}") String baseUrl,
            @Value("${journey.return-prediction.timeout:2s}") Duration timeout,
            @Value("${journey.return-prediction.max-response-age:15m}") Duration maxResponseAge) {
        return new ReturnPredictionProperties(enabled, baseUrl, timeout, maxResponseAge);
    }

    @Bean
    ReturnPredictionPort returnPredictionPort(RestClient.Builder builder, ReturnPredictionProperties properties) {
        return new ReturnPredictionClient(builder, properties);
    }
}
