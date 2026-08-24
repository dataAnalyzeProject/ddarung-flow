package com.ddarungflow.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventId\":\"" + UUID.randomUUID() + "\",\"paymentKey\":\"\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PAYMENT_VERIFICATION_FAILED"));
    }
}
