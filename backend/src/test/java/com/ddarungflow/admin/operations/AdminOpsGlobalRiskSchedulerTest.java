package com.ddarungflow.admin.operations;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AdminOpsGlobalRiskSchedulerTest {
    @Test
    void delegatesAndKeepsConfiguredThirtySecondInitialAndFifteenMinuteDefaults() throws Exception {
        AdminOpsGlobalRiskGenerationService generation = mock(AdminOpsGlobalRiskGenerationService.class);
        new AdminOpsGlobalRiskScheduler(generation).generate();
        verify(generation).generate();

        Scheduled scheduled = AdminOpsGlobalRiskScheduler.class.getMethod("generate").getAnnotation(Scheduled.class);
        assertThat(scheduled.initialDelayString()).isEqualTo("${admin.ops.global-risk.initial-delay-ms:30000}");
        assertThat(scheduled.fixedDelayString()).isEqualTo("${admin.ops.global-risk.fixed-delay-ms:900000}");
    }
}
