package com.ddarungflow.prediction;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import com.ddarungflow.repository.UsersRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PredictionReliabilityControllerTest {
    @Autowired MockMvc mvc;
    @Autowired UsersRepository users;
    @Autowired ModelPerformanceRunRepository runs;
    @Autowired ObjectMapper mapper;
    private UsernamePasswordAuthenticationToken auth;

    @BeforeEach
    void clear() {
        runs.deleteAll();
        users.deleteAll();
        Users user = users.save(Users.builder().provider("google").providerUserId("reliability-user").displayName("user").role(UserRole.USER).build());
        PrincipalDetails principal = new PrincipalDetails(user);
        auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }

    @Test
    void returnsOneBandWithExactCalibrationErrorAndNoForbiddenFields() throws Exception {
        saveRun(1200, 0.747, 0.83);

        mvc.perform(request())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.band.lowerPercent").value(70))
                .andExpect(jsonPath("$.band.upperPercent").value(80))
                .andExpect(jsonPath("$.band.meanPredicted").value(0.747))
                .andExpect(jsonPath("$.band.accuracyRate").value(0.83))
                .andExpect(jsonPath("$.band.calibrationErrorPercent").value(8.3))
                .andExpect(jsonPath("$.reliabilityLevel").value("LOW"))
                .andExpect(jsonPath("$.brierScore").doesNotExist())
                .andExpect(jsonPath("$.baselineBrierScore").doesNotExist())
                .andExpect(jsonPath("$.skillScore").doesNotExist())
                .andExpect(jsonPath("$.artifactSha256").doesNotExist())
                .andExpect(jsonPath("$.limitations").doesNotExist())
                .andExpect(jsonPath("$.combinationCalibration").doesNotExist());
    }

    @Test
    void classifiesExactTwoAndSixPercentBoundaries() throws Exception {
        saveRun(1200, 0.70, 0.72);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.band.calibrationErrorPercent").value(2.0))
                .andExpect(jsonPath("$.reliabilityLevel").value("HIGH"));

        runs.deleteAll();
        saveRun(1200, 0.66, 0.72);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.band.calibrationErrorPercent").value(6.0))
                .andExpect(jsonPath("$.reliabilityLevel").value("MEDIUM"));

        runs.deleteAll();
        saveRun(1200, 0.659, 0.72);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.reliabilityLevel").value("LOW"));
    }

    @Test
    void unknownNullsAllPublicAccuracyFieldsForInsufficientOrMissingActuals() throws Exception {
        saveRun(999, 0.747, 0.83);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.reliabilityLevel").value("UNKNOWN"))
                .andExpect(jsonPath("$.band.accuracyRate").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.band.meanPredicted").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.band.calibrationErrorPercent").value(org.hamcrest.Matchers.nullValue()));

        runs.deleteAll();
        saveRun(1200, 0.747, null);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.reliabilityLevel").value("UNKNOWN"))
                .andExpect(jsonPath("$.band.accuracyRate").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.band.meanPredicted").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.band.calibrationErrorPercent").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void missingEvaluationReturnsReliabilityNotAvailable() throws Exception {
        mvc.perform(request()).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RELIABILITY_NOT_AVAILABLE"));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request() {
        return get("/api/v1/prediction-reliability")
                .queryParam("horizonMinutes", "120")
                .queryParam("requiredBikeCount", "3")
                .queryParam("stationId", "ST-10")
                .queryParam("probability", "0.72")
                .with(authentication(auth));
    }

    private void saveRun(int bandSampleCount, double meanPredicted, Double actualRate) {
        ObjectNode payload = mapper.createObjectNode();
        payload.putObject("evaluation").put("minSampleThreshold", 1000);
        ArrayNode combinations = payload.putArray("combinations");
        combinations.addObject().put("horizonMinutes", 120).put("requiredBikeCount", 3).put("sampleCount", 529773).put("brierScore", 0.1);
        ArrayNode calibration = payload.putArray("combinationCalibration");
        ArrayNode bins = calibration.addObject().put("horizonMinutes", 120).put("requiredBikeCount", 3).putArray("bins");
        ObjectNode band = bins.addObject().put("binLowerPercent", 70).put("binUpperPercent", 80).put("sampleCount", bandSampleCount).put("meanPredicted", meanPredicted);
        if (actualRate == null) band.putNull("actualRate"); else band.put("actualRate", actualRate);
        runs.save(new ModelPerformanceRun("ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741", "data-3.3-inventory-distribution-2026-08-18", OffsetDateTime.parse("2026-08-26T11:40:00Z"), payload));
    }
}
