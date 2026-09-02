package com.ddarungflow.journey.saved;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.payment.PremiumEntitlementService;
import com.fasterxml.jackson.databind.JsonMappingException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.converter.HttpMessageNotReadableException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/saved-journeys")
@RequiredArgsConstructor
public class SavedJourneyController {

    private final SavedJourneyService service;
    private final PremiumEntitlementService premiumEntitlement;

    @PostMapping
    public SavedJourneyDtos.SavedJourneyResponse save(@AuthenticationPrincipal PrincipalDetails principal,
                                                       @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                                       @RequestBody SavedJourneyDtos.SaveRequest request) {
        return response(service.save(userId(principal), idempotencyKey, request));
    }

    @GetMapping
    public List<SavedJourneyDtos.SavedJourneyResponse> list(@AuthenticationPrincipal PrincipalDetails principal) {
        return service.list(userId(principal)).stream().map(this::response).toList();
    }

    @PostMapping("/{savedJourneyId}/replay")
    public JourneyPlanService.Decision replay(@AuthenticationPrincipal PrincipalDetails principal,
                                              @PathVariable String savedJourneyId,
                                              @RequestBody SavedJourneyDtos.ReplayRequest request) {
        return service.replay(userId(principal), savedJourneyId, request,
                () -> premiumEntitlement.requireActive(principal.getUsers()));
    }

    @DeleteMapping("/{savedJourneyId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable String savedJourneyId) {
        service.delete(userId(principal), savedJourneyId);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(AuthenticationRequiredException.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new SavedJourneyDtos.ErrorResponse("AUTH_REQUIRED"));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class, JsonMappingException.class,
            JourneyPlanService.InvalidJourneyInput.class})
    ResponseEntity<SavedJourneyDtos.ErrorResponse> invalid() {
        return ResponseEntity.badRequest().body(new SavedJourneyDtos.ErrorResponse("JOURNEY_INTENT_INVALID"));
    }

    @ExceptionHandler(SavedJourneyService.SavedJourneyNotFoundException.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> notAccessible() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new SavedJourneyDtos.ErrorResponse("JOURNEY_NOT_ACCESSIBLE"));
    }

    @ExceptionHandler(SavedJourneyService.IdempotencyConflictException.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> conflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new SavedJourneyDtos.ErrorResponse("IDEMPOTENCY_CONFLICT"));
    }

    @ExceptionHandler(SavedJourneyService.SavedJourneyLimitException.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> limitReached() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new SavedJourneyDtos.ErrorResponse("SAVED_ROUTE_LIMIT_REACHED"));
    }

    @ExceptionHandler(PremiumEntitlementService.PremiumRequired.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> premiumRequired() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new SavedJourneyDtos.ErrorResponse("PREMIUM_REQUIRED"));
    }

    @ExceptionHandler(PremiumEntitlementService.EntitlementUnavailable.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> entitlementUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new SavedJourneyDtos.ErrorResponse("PREMIUM_ENTITLEMENT_UNAVAILABLE"));
    }

    @ExceptionHandler(SavedJourneyService.PlaceReferenceUnavailableException.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> placeUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new SavedJourneyDtos.ErrorResponse("PLACE_REFERENCE_UNAVAILABLE"));
    }

    @ExceptionHandler(JourneyPlanService.AiOutputSchemaInvalid.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> aiOutputInvalid() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new SavedJourneyDtos.ErrorResponse("AI_OUTPUT_SCHEMA_INVALID"));
    }

    @ExceptionHandler(JourneyPlanService.AiToolValueMismatch.class)
    ResponseEntity<SavedJourneyDtos.ErrorResponse> aiValueMismatch() {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new SavedJourneyDtos.ErrorResponse("AI_TOOL_VALUE_MISMATCH"));
    }

    private Long userId(PrincipalDetails principal) {
        if (principal == null || principal.getUsers() == null || principal.getUsers().getId() == null) throw new AuthenticationRequiredException();
        return principal.getUsers().getId();
    }

    private SavedJourneyDtos.SavedJourneyResponse response(SavedJourneyEntity saved) {
        return new SavedJourneyDtos.SavedJourneyResponse(saved.getPublicId(), saved.getDisplayName(), service.replayInput(saved), saved.getCreatedAt().toString());
    }

    static class AuthenticationRequiredException extends RuntimeException { }
}
