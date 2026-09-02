package com.ddarungflow.journey.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.payment.PremiumEntitlementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/journeys")
public class JourneyController {
    private static final Logger log = LoggerFactory.getLogger(JourneyController.class);
    private final JourneyPlanService service;
    private final PremiumEntitlementService premiumEntitlement;

    @Autowired
    public JourneyController(JourneyPlanService service, PremiumEntitlementService premiumEntitlement) {
        this.service = service;
        this.premiumEntitlement = premiumEntitlement;
    }

    JourneyController(JourneyPlanService service) {
        this(service, null);
    }

    @PostMapping("/plan")
    public JourneyPlanService.Decision plan(@AuthenticationPrincipal PrincipalDetails principal,
                                            @RequestBody JourneyPlanService.PlanInput input) {
        return service.plan(userId(principal), input, () -> premiumEntitlement.requireActive(principal.getUsers()));
    }

    @GetMapping("/{decisionId}")
    public JourneyPlanService.Decision find(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable String decisionId) {
        return service.find(userId(principal), decisionId);
    }

    @PostMapping("/{decisionId}/replan")
    public JourneyPlanService.Decision replan(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable String decisionId,
                                              @RequestBody JourneyPlanService.PlanInput input) {
        return service.replan(userId(principal), decisionId, input,
                () -> premiumEntitlement.requireActive(principal.getUsers()));
    }

    @PostMapping("/{decisionId}/counterfactuals")
    public JourneyPlanService.Counterfactual counterfactual(@AuthenticationPrincipal PrincipalDetails principal,
                                                            @PathVariable String decisionId) {
        return service.counterfactual(userId(principal), decisionId);
    }

    @ExceptionHandler({JourneyPlanService.InvalidJourneyInput.class, HttpMessageNotReadableException.class})
    ResponseEntity<Map<String, String>> invalid() { return error(400, "JOURNEY_INTENT_INVALID"); }

    @ExceptionHandler(JourneyPlanService.AiOutputSchemaInvalid.class)
    ResponseEntity<Map<String, String>> aiOutputSchemaInvalid(JourneyPlanService.AiOutputSchemaInvalid exception) {
        log.warn("event=journey_ai_schema_invalid stage={}", exception.failureStage() == null ? "UNKNOWN" : exception.failureStage());
        return error(502, "AI_OUTPUT_SCHEMA_INVALID");
    }

    @ExceptionHandler(JourneyPlanService.AiToolValueMismatch.class)
    ResponseEntity<Map<String, String>> aiToolValueMismatch() { return error(500, "AI_TOOL_VALUE_MISMATCH"); }

    @ExceptionHandler(JourneyPlanService.DecisionMissing.class)
    ResponseEntity<Map<String, String>> missing() { return error(404, "JOURNEY_NOT_ACCESSIBLE"); }

    @ExceptionHandler(JourneyPlanService.DecisionExpired.class)
    ResponseEntity<Map<String, String>> expired() { return error(410, "JOURNEY_EXPIRED"); }

    @ExceptionHandler(JourneyPlanService.RevisionConflict.class)
    ResponseEntity<Map<String, String>> conflict() { return error(409, "JOURNEY_REVISION_CONFLICT"); }

    @ExceptionHandler(JourneyPlanService.NoValidCandidate.class)
    ResponseEntity<Map<String, String>> noValidCandidate() { return error(422, "JOURNEY_NO_VALID_CANDIDATE"); }

    @ExceptionHandler(PremiumEntitlementService.PremiumRequired.class)
    ResponseEntity<Map<String, String>> premiumRequired() { return error(403, "PREMIUM_REQUIRED"); }

    @ExceptionHandler(PremiumEntitlementService.EntitlementUnavailable.class)
    ResponseEntity<Map<String, String>> entitlementUnavailable() { return error(503, "PREMIUM_ENTITLEMENT_UNAVAILABLE"); }

    private long userId(PrincipalDetails principal) {
        if (principal == null || principal.getUsers() == null || principal.getUsers().getId() == null) {
            throw new JourneyPlanService.DecisionMissing();
        }
        return principal.getUsers().getId();
    }

    private ResponseEntity<Map<String, String>> error(int status, String code) {
        return ResponseEntity.status(status).body(Map.of("code", code));
    }
}
