package com.ddarungflow.journey.controller;

import com.ddarungflow.journey.application.JourneyPlanService;
import org.springframework.http.ResponseEntity;
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
    public JourneyController(JourneyPlanService service) { this.service = service; }
    @PostMapping("/plan") public JourneyPlanService.Decision plan(@RequestBody JourneyPlanService.PlanInput input) { return service.plan(input); }
    @GetMapping("/{decisionId}") public JourneyPlanService.Decision find(@PathVariable String decisionId) { return service.find(decisionId); }
    @PostMapping("/{decisionId}/replan") public JourneyPlanService.Decision replan(@PathVariable String decisionId, @RequestBody JourneyPlanService.PlanInput input) { return service.replan(decisionId, input); }
    @PostMapping("/{decisionId}/counterfactuals") public JourneyPlanService.Counterfactual counterfactual(@PathVariable String decisionId) { return service.counterfactual(decisionId); }
    @ExceptionHandler(JourneyPlanService.InvalidJourneyInput.class) ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("code", "JOURNEY_INTENT_INVALID")); }
    @ExceptionHandler(JourneyPlanService.DecisionMissing.class) ResponseEntity<Map<String, String>> missing() { return ResponseEntity.status(404).body(Map.of("code", "JOURNEY_NOT_ACCESSIBLE")); }
}
