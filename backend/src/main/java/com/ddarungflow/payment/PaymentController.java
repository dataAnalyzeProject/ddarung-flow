package com.ddarungflow.payment;
import com.ddarungflow.dto.PrincipalDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1")
public class PaymentController {
  private final SubscriptionService subscriptions;
  @GetMapping("/me/subscription") public Map<String,Object> subscription(@AuthenticationPrincipal PrincipalDetails principal) { return subscriptions.current(principal.getUsers()); }
  @PostMapping("/payments/checkout") public ResponseEntity<?> checkout(@AuthenticationPrincipal PrincipalDetails principal, @RequestBody Map<String,String> request) {
    try {
      Map<String,Object> result=subscriptions.checkout(principal.getUsers(), SubscriptionPlan.valueOf(request.get("planId")));
      if ("PAYMENT_NOT_ENABLED".equals(result.get("code"))) return ResponseEntity.status(503).body(result);
      if ("SUBSCRIPTION_ALREADY_ACTIVE".equals(result.get("code"))) return ResponseEntity.status(409).body(result);
      return ResponseEntity.ok(result);
    } catch (IllegalArgumentException ex) { return ResponseEntity.badRequest().body(Map.of("code", "PAYMENT_PLAN_INVALID")); }
  }
  @PostMapping("/payments/webhooks/toss") public ResponseEntity<?> webhook(@RequestBody Map<String,String> request) {
    Map<String,Object> result = subscriptions.processWebhook(request.get("eventId"), request.get("paymentKey"));
    if ("PAYMENT_EVENT_INVALID".equals(result.get("code"))) return ResponseEntity.badRequest().body(result);
    if ("PAYMENT_VERIFICATION_FAILED".equals(result.get("code"))) return ResponseEntity.status(401).body(result);
    return ResponseEntity.ok(result);
  }
  @PostMapping("/payments/confirm") public ResponseEntity<?> confirm(@AuthenticationPrincipal PrincipalDetails principal, @RequestBody Map<String,String> request) {
    try {
      Map<String,Object> result = subscriptions.confirm(principal.getUsers(), request.get("paymentKey"), request.get("orderId"), Integer.parseInt(request.get("amount")));
      return "ACTIVE".equals(result.get("status")) ? ResponseEntity.ok(result) : ResponseEntity.status(401).body(result);
    } catch (RuntimeException ex) { return ResponseEntity.badRequest().body(Map.of("code", "PAYMENT_VERIFICATION_FAILED")); }
  }
}
