package com.ddarungflow.payment;
import com.ddarungflow.entity.Users;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class SubscriptionService {
  private final SubscriptionRepository subscriptions;
  private final PaymentRepository payments;
  private final PaymentEventRepository paymentEvents;
  private final PaymentVerifier paymentVerifier;
  private final PaymentEnvironment paymentEnvironment;
  @Transactional public Map<String,Object> current(Users user) {
    return subscriptions.findFirstByUserOrderByEndsAtDesc(user).map(s -> {
      boolean active=s.isActive(OffsetDateTime.now());
      return Map.<String,Object>of("status", active ? "ACTIVE" : "EXPIRED", "planId", s.getPlan().name(), "startsAt", s.getStartsAt().toString(), "endsAt", s.getEndsAt().toString());
    }).orElseGet(() -> Map.of("status", "FREE"));
  }
  @Transactional public Map<String,Object> checkout(Users user, SubscriptionPlan plan) {
    if (!paymentEnvironment.sandboxCheckoutEnabled()) return Map.of("code", "PAYMENT_NOT_ENABLED");
    Map<String,Object> current=current(user);
    if ("ACTIVE".equals(current.get("status"))) return Map.of("code", "SUBSCRIPTION_ALREADY_ACTIVE");
    Payment payment = payments.save(new Payment(user, "ddarung-" + UUID.randomUUID(), plan));
    return Map.of("status", "READY", "orderId", payment.getOrderId(), "customerKey", "ddarung-" + user.getPublicId(), "planId", plan.name(), "amount", payment.getAmount(), "currency", payment.getCurrency());
  }
  @Transactional public Map<String,Object> processWebhook(String eventId, String paymentKey) {
    if (eventId == null || eventId.isBlank()) return Map.of("code", "PAYMENT_EVENT_INVALID");
    Optional<PaymentEvent> existing = paymentEvents.findByProviderAndEventId("TOSS", eventId);
    if (existing.isPresent()) return resultFor(existing.get().getOutcome());
    final VerifiedTossPayment verified;
    try {
      verified = paymentVerifier.verify(paymentKey);
    } catch (RuntimeException ex) {
      return recordFailure(eventId);
    }
    Payment payment = payments.findByOrderId(verified.orderId()).orElse(null);
    if (!verified.isDone()) {
      if (payment != null && payment.getStatus() == PaymentStatus.READY) {
        payment.markProcessing();
        if ("CANCELED".equals(verified.status())) payment.markCanceled();
        else payment.markFailed();
      }
      return recordFailure(eventId);
    }
    if (payment == null || payment.getStatus() != PaymentStatus.READY
        || payment.getAmount() != verified.amount() || !payment.getCurrency().equals(verified.currency())) {
      return recordFailure(eventId);
    }
    payment.markProcessing();
    payment.markSucceeded();
    subscriptions.save(new Subscription(payment.getUser(), payment.getPlan(), OffsetDateTime.now()));
    paymentEvents.save(new PaymentEvent("TOSS", eventId, PaymentEventOutcome.ACTIVE));
    return Map.of("status", "ACTIVE");
  }
  @Transactional public Map<String,Object> confirm(Users user, String paymentKey, String orderId, int amount) {
    Payment payment = payments.findByOrderId(orderId).orElse(null);
    if (payment == null || payment.getUser().getId() == null || !payment.getUser().getId().equals(user.getId()) || payment.getStatus() != PaymentStatus.READY || payment.getAmount() != amount) return Map.of("code", "PAYMENT_VERIFICATION_FAILED");
    final VerifiedTossPayment verified;
    try { verified = paymentVerifier.confirm(paymentKey, orderId, amount); } catch (RuntimeException ex) { return Map.of("code", "PAYMENT_VERIFICATION_FAILED"); }
    if (!orderId.equals(verified.orderId()) || verified.amount() != amount || !"KRW".equals(verified.currency()) || !verified.isDone()) return Map.of("code", "PAYMENT_VERIFICATION_FAILED");
    payment.markProcessing(); payment.markSucceeded();
    subscriptions.save(new Subscription(payment.getUser(), payment.getPlan(), OffsetDateTime.now()));
    return Map.of("status", "ACTIVE");
  }
  private Map<String,Object> recordFailure(String eventId) {
    paymentEvents.save(new PaymentEvent("TOSS", eventId, PaymentEventOutcome.VERIFICATION_FAILED));
    return resultFor(PaymentEventOutcome.VERIFICATION_FAILED);
  }
  private Map<String,Object> resultFor(PaymentEventOutcome outcome) {
    return outcome == PaymentEventOutcome.ACTIVE ? Map.of("status", "ACTIVE") : Map.of("code", "PAYMENT_VERIFICATION_FAILED");
  }
}
