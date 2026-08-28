package com.ddarungflow.journey.release;

import com.ddarungflow.journey.persistence.JourneyDecisionRepository;
import com.ddarungflow.journey.saved.SavedJourneyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "journey.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JourneyReleaseGateFilterTest {
    @Autowired private MockMvc mvc;
    @Autowired private JourneyDecisionRepository decisions;
    @Autowired private SavedJourneyRepository savedJourneys;

    @Test
    void hidesJourneyAndSavedJourneyEndpointsBeforeTheyCanWrite() throws Exception {
        mvc.perform(post("/api/v1/journeys/plan")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/journeys/decision-id")).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/saved-journeys")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/saved-journeys")).andExpect(status().isNotFound());

        assertThat(decisions.count()).isZero();
        assertThat(savedJourneys.count()).isZero();
    }
}
