package com.ddarungflow.journey.application;

import com.ddarungflow.journey.domain.JourneyStatus;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class JourneyPlanServiceTest {
    private final JourneyPlanService service = new JourneyPlanService(true);
    @Test void createsPartialFixtureDecisionWithSeparateProbabilities() {
        JourneyPlanService.Decision decision = service.plan(new JourneyPlanService.PlanInput("성수역", "서울숲", 2, 60));
        assertThat(decision.status()).isEqualTo(JourneyStatus.PARTIAL);
        assertThat(decision.candidates()).hasSize(3).allSatisfy(candidate -> {
            assertThat(candidate.rentalProbability()).isPositive(); assertThat(candidate.returnProbability()).isPositive();
        });
    }
    @Test void rejectsInvalidBikeCount() { assertThatThrownBy(() -> service.plan(new JourneyPlanService.PlanInput("성수역", "서울숲", 6, 60))).isInstanceOf(JourneyPlanService.InvalidJourneyInput.class); }
    @Test void keepsProductionAdapterDisabledUntilTheIntegrationLane() {
        JourneyPlanService.Decision decision = new JourneyPlanService(false).plan(new JourneyPlanService.PlanInput("성수역", "서울숲", 1, 60));
        assertThat(decision.status()).isEqualTo(JourneyStatus.UNAVAILABLE);
        assertThat(decision.candidates()).isEmpty();
    }
}
