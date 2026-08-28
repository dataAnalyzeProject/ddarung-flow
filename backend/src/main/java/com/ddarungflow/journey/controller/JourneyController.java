package com.ddarungflow.journey.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.journey.application.JourneyPlanService;
import org.springframework.http.ResponseEntity;
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
    private final JourneyPlanService service;

    public JourneyController(JourneyPlanService service) {
        this.service = service;
    }

    @PostMapping("/plan")
    public JourneyPlanService.Decision plan(@AuthenticationPrincipal PrincipalDetails principal,
                                            @RequestBody JourneyPlanService.PlanInput input) {
        return service.plan(userId(principal), input);
    }

    @GetMapping("/{decisionId}")
    public JourneyPlanService.Decision find(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable String decisionId) {
        return service.find(userId(principal), decisionId);
    }

    @PostMapping("/{decisionId}/replan")
    public JourneyPlanService.Decision replan(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable String decisionId,
                                              @RequestBody JourneyPlanService.PlanInput input) {
        return service.replan(userId(principal), decisionId, input);
    }

    @PostMapping("/{decisionId}/counterfactuals")
    public JourneyPlanService.Counterfactual counterfactual(@AuthenticationPrincipal PrincipalDetails principal,
                                                            @PathVariable String decisionId) {
        return service.counterfactual(userId(principal), decisionId);
    }

    @ExceptionHandler(JourneyPlanService.InvalidJourneyInput.class)
    ResponseEntity<Map<String, String>> invalid() { return error(400, "JOURNEY_INTENT_INVALID"); }

    @ExceptionHandler(JourneyPlanService.DecisionMissing.class)
    ResponseEntity<Map<String, String>> missing() { return error(404, "JOURNEY_NOT_ACCESSIBLE"); }

    @ExceptionHandler(JourneyPlanService.DecisionExpired.class)
    ResponseEntity<Map<String, String>> expired() { return error(410, "JOURNEY_EXPIRED"); }

    @ExceptionHandler(JourneyPlanService.RevisionConflict.class)
    ResponseEntity<Map<String, String>> conflict() { return error(409, "JOURNEY_REVISION_CONFLICT"); }

    @ExceptionHandler(JourneyPlanService.NoValidCandidate.class)
    ResponseEntity<Map<String, String>> noValidCandidate() { return error(422, "JOURNEY_NO_VALID_CANDIDATE"); }

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
