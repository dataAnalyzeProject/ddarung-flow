package com.ddarungflow.config;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void anonymousWebhookReachesControllerAndReturnsVerificationFailure() throws Exception {
        mockMvc.perform(post("/api/v1/payments/webhooks/toss")
                        .header("tosspayments-webhook-transmission-id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventType\":\"PAYMENT_STATUS_CHANGED\",\"data\":{\"paymentKey\":\"\"}}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PAYMENT_VERIFICATION_FAILED"));
    }

    @Test
    void anonymousPredictionReliabilityReturnsJsonAuthRequiredInsteadOfRedirect() throws Exception {
        mockMvc.perform(get("/api/v1/prediction-reliability")
                        .queryParam("horizonMinutes", "120")
                        .queryParam("requiredBikeCount", "3")
                        .queryParam("probability", "0.72"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void anonymousRidingGuideAiReturnsJsonAuthRequiredInsteadOfRedirect() throws Exception {
        mockMvc.perform(post("/api/v1/riding-guide/ai")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stationId\":\"ST-4\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }

    @Test
    void authenticatedRidingGuideAiKeepsCsrfBoundaryAndReachesControllerWithToken() throws Exception {
        UsernamePasswordAuthenticationToken token = authenticatedUserToken();

        mockMvc.perform(post("/api/v1/riding-guide/ai")
                        .with(authentication(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stationId\":\"\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/riding-guide/ai")
                        .with(authentication(token))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stationId\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RIDING_GUIDE_INVALID"));
    }

    private UsernamePasswordAuthenticationToken authenticatedUserToken() {
        Users user = Users.builder()
                .provider("test")
                .providerUserId("riding-guide-security")
                .displayName("riding-guide-security")
                .build();
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
