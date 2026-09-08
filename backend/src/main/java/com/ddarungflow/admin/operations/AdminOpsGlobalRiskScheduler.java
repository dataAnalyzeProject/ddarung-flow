package com.ddarungflow.admin.operations;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public class AdminOpsGlobalRiskScheduler {
    private final AdminOpsGlobalRiskGenerationService generationService;

    public AdminOpsGlobalRiskScheduler(AdminOpsGlobalRiskGenerationService generationService) {
        this.generationService = generationService;
    }

    @Scheduled(
            initialDelayString = "${admin.ops.global-risk.initial-delay-ms:30000}",
            fixedDelayString = "${admin.ops.global-risk.fixed-delay-ms:900000}"
    )
    public void generate() { generationService.generate(); }
}
