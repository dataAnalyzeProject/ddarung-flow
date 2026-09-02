package com.ddarungflow.ridingguide;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.payment.PremiumEntitlementService;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/riding-guide")
public class RidingGuideController {
    private final RidingGuideService service;

    public RidingGuideController(RidingGuideService service) {
        this.service = service;
    }

    @PostMapping("/ai")
    public RidingGuideDtos.Response generate(
            @AuthenticationPrincipal PrincipalDetails principal,
            @RequestBody RidingGuideDtos.Request request
    ) {
        if (principal == null || principal.getUsers() == null) throw new Unauthorized();
        return service.generate(principal.getUsers(), request);
    }

    @ExceptionHandler({RidingGuideService.InvalidInput.class, HttpMessageNotReadableException.class})
    ResponseEntity<Map<String, String>> invalid() { return error(400, "RIDING_GUIDE_INVALID"); }

    @ExceptionHandler({RidingGuideService.StationNotFound.class, JourneyPlanService.DecisionMissing.class})
    ResponseEntity<Map<String, String>> missing() { return error(404, "RIDING_GUIDE_NOT_ACCESSIBLE"); }

    @ExceptionHandler(JourneyPlanService.DecisionExpired.class)
    ResponseEntity<Map<String, String>> expired() { return error(410, "JOURNEY_EXPIRED"); }

    @ExceptionHandler(PremiumEntitlementService.PremiumRequired.class)
    ResponseEntity<Map<String, String>> premiumRequired() { return error(403, "PREMIUM_REQUIRED"); }

    @ExceptionHandler(PremiumEntitlementService.EntitlementUnavailable.class)
    ResponseEntity<Map<String, String>> entitlementUnavailable() { return error(503, "PREMIUM_ENTITLEMENT_UNAVAILABLE"); }

    @ExceptionHandler(Unauthorized.class)
    ResponseEntity<Map<String, String>> unauthorized() { return error(401, "AUTH_REQUIRED"); }

    private ResponseEntity<Map<String, String>> error(int status, String code) {
        return ResponseEntity.status(status).body(Map.of("code", code));
    }

    static class Unauthorized extends RuntimeException { }
}
