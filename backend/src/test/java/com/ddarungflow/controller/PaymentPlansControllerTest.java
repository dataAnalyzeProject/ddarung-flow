package com.ddarungflow.controller;

import com.ddarungflow.payment.PaymentVerifier;
import com.ddarungflow.payment.SubscriptionPlan;
import com.ddarungflow.payment.SubscriptionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PaymentPlansControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean SubscriptionService subscriptions;
    @MockitoBean PaymentVerifier paymentVerifier;

    @Test
    void anonymousCatalogReadUsesTheExistingLoginBoundary() throws Exception {
        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("http://localhost:3000/login"));

        verifyNoInteractions(subscriptions, paymentVerifier);
    }

    @Test
    void authenticatedReadReturnsEveryCheckoutPlanWithoutPaymentSideEffectsOrCsrf() throws Exception {
        for (int read = 0; read < 2; read++) {
            ResultActions response = mvc.perform(get("/api/v1/payments/plans").with(user("catalog-reader")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$.plans.length()").value(SubscriptionPlan.values().length));

            for (int index = 0; index < SubscriptionPlan.values().length; index++) {
                SubscriptionPlan plan = SubscriptionPlan.values()[index];
                String path = "$.plans[" + index + "]";
                response.andExpect(jsonPath(path + ".length()").value(4))
                        .andExpect(jsonPath(path + ".planId").value(plan.name()))
                        .andExpect(jsonPath(path + ".amount").value(plan.amount()))
                        .andExpect(jsonPath(path + ".currency").value("KRW"))
                        .andExpect(jsonPath(path + ".durationDays").value((int) plan.duration().toDays()));
            }
        }

        verifyNoInteractions(subscriptions, paymentVerifier);
    }
}
