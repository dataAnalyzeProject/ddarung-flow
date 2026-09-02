package com.ddarungflow.payment;

import com.ddarungflow.entity.Users;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.notification.PremiumNotificationService;
import org.springframework.http.ResponseEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SubscriptionServiceTest {
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final PaymentEventRepository events = mock(PaymentEventRepository.class);
    private final PaymentVerifier verifier = mock(PaymentVerifier.class);
    private final PremiumNotificationService premiumNotifications = mock(PremiumNotificationService.class);
    private final SubscriptionService service = new SubscriptionService(
        subscriptions, payments, events, verifier, new PaymentEnvironment("sandbox", "test_sk_sandbox"), premiumNotifications
    );
    private final Users user = Users.builder().provider("test").providerUserId("u1").displayName("tester").build();

    @BeforeEach
    void initializeUserPublicId() throws ReflectiveOperationException {
        user.prePersist();
        assignId(user, 1L);
        lenient().when(subscriptions.save(any(Subscription.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private void assignId(Users target, long id) throws ReflectiveOperationException {
        Field field = Users.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(target, id);
    }

    @Test
    void checkoutUsesServerDefinedMonthlyAmountAndDurationPlan() {
        when(subscriptions.findFirstByUserOrderByEndsAtDesc(user)).thenReturn(Optional.empty());
        when(payments.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = service.checkout(user, SubscriptionPlan.PREMIUM_MONTHLY_30D);

        assertEquals("READY", result.get("status"));
        assertEquals(2900, result.get("amount"));
        assertEquals("KRW", result.get("currency"));
        assertEquals("PREMIUM_MONTHLY_30D", result.get("planId"));
        assertEquals("ddarung-" + user.getPublicId(), result.get("customerKey"));
    }

    @Test
    void activeSubscriberCannotCreateAnotherCheckout() {
        when(subscriptions.findFirstByUserOrderByEndsAtDesc(user))
                .thenReturn(Optional.of(new Subscription(user, SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now())));

        var result = service.checkout(user, SubscriptionPlan.PREMIUM_YEARLY_365D);

        assertEquals("SUBSCRIPTION_ALREADY_ACTIVE", result.get("code"));
        verify(payments, never()).save(any());
    }

    @Test
    void expiredSubscriberCanCheckoutAgain() {
        when(subscriptions.findFirstByUserOrderByEndsAtDesc(user))
                .thenReturn(Optional.of(new Subscription(user, SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now().minusDays(31))));
        when(payments.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = service.checkout(user, SubscriptionPlan.PREMIUM_YEARLY_365D);

        assertEquals("READY", result.get("status"));
        assertEquals("PREMIUM_YEARLY_365D", result.get("planId"));
        verify(payments).save(any(Payment.class));
    }

    @Test
    void subscriptionStatusIsIsolatedByUser() {
        Users otherUser = Users.builder().provider("test").providerUserId("u2").displayName("other").build();
        when(subscriptions.findFirstByUserOrderByEndsAtDesc(user))
                .thenReturn(Optional.of(new Subscription(user, SubscriptionPlan.PREMIUM_MONTHLY_30D, OffsetDateTime.now())));
        when(subscriptions.findFirstByUserOrderByEndsAtDesc(otherUser)).thenReturn(Optional.empty());

        var ownerSubscription = service.current(user);
        var otherSubscription = service.current(otherUser);

        assertEquals("ACTIVE", ownerSubscription.get("status"));
        assertEquals("FREE", otherSubscription.get("status"));
    }

    @Test
    void verifiedWebhookActivatesOnlyMatchingPayment() {
        Payment payment = new Payment(user, "ddarung-order-1", SubscriptionPlan.PREMIUM_YEARLY_365D);
        when(events.findByProviderAndEventId("TOSS", "event-1")).thenReturn(Optional.empty());
        when(verifier.verify("key-1")).thenReturn(new VerifiedTossPayment("ddarung-order-1", "key-1", 29000, "KRW", "DONE"));
        when(payments.findByOrderId("ddarung-order-1")).thenReturn(Optional.of(payment));

        var result = service.processWebhook("event-1", "key-1");

        assertEquals("ACTIVE", result.get("status"));
        assertEquals(PaymentStatus.SUCCEEDED, payment.getStatus());
        ArgumentCaptor<Subscription> subscription = ArgumentCaptor.forClass(Subscription.class);
        verify(subscriptions).save(subscription.capture());
        verify(premiumNotifications).notifyActivated(subscription.getValue(), payment.getOrderId());
        assertEquals(SubscriptionPlan.PREMIUM_YEARLY_365D, subscription.getValue().getPlan());
        assertTrue(subscription.getValue().getEndsAt().isAfter(OffsetDateTime.now().plusDays(364)));
    }

    @Test
    void inProgressWebhookUsesServerSideConfirmationBeforeActivation() {
        Payment payment = new Payment(user, "ddarung-order-confirm", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(events.findByProviderAndEventId("TOSS", "event-confirm")).thenReturn(Optional.empty());
        when(verifier.verify("key-confirm"))
                .thenReturn(new VerifiedTossPayment("ddarung-order-confirm", "key-confirm", 2900, "KRW", "IN_PROGRESS"))
                .thenReturn(new VerifiedTossPayment("ddarung-order-confirm", "key-confirm", 2900, "KRW", "DONE"));
        when(payments.findByOrderId("ddarung-order-confirm")).thenReturn(Optional.of(payment));

        var result = service.processWebhook("event-confirm", "key-confirm");

        assertEquals("ACTIVE", result.get("status"));
        verify(verifier).confirm("key-confirm", "ddarung-order-confirm", 2900);
        verify(verifier, times(2)).verify("key-confirm");
        verify(subscriptions).save(any(Subscription.class));
        verify(premiumNotifications).notifyActivated(any(Subscription.class), eq(payment.getOrderId()));
    }

    @Test
    void successfulRedirectConfirmationActivatesOnlyItsOwner() {
        Payment payment = new Payment(user, "ddarung-order-redirect", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(payments.findByOrderId("ddarung-order-redirect")).thenReturn(Optional.of(payment));
        when(verifier.verify("key-redirect"))
                .thenReturn(new VerifiedTossPayment("ddarung-order-redirect", "key-redirect", 2900, "KRW", "DONE"));

        var result = service.confirmRedirect(user, "key-redirect", "ddarung-order-redirect", 2900);

        assertEquals("ACTIVE", result.get("status"));
        assertEquals(PaymentStatus.SUCCEEDED, payment.getStatus());
        verify(verifier).confirm("key-redirect", "ddarung-order-redirect", 2900);
        verify(subscriptions).save(any(Subscription.class));
        verify(premiumNotifications).notifyActivated(any(Subscription.class), eq(payment.getOrderId()));
    }

    @Test
    void redirectConfirmationCannotActivateAnotherUsersOrder() throws ReflectiveOperationException {
        Users otherUser = Users.builder().provider("test").providerUserId("u2").displayName("other").build();
        otherUser.prePersist();
        assignId(otherUser, 2L);
        Payment payment = new Payment(otherUser, "ddarung-order-other", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(payments.findByOrderId("ddarung-order-other")).thenReturn(Optional.of(payment));

        var result = service.confirmRedirect(user, "key-other", "ddarung-order-other", 2900);

        assertEquals("PAYMENT_VERIFICATION_FAILED", result.get("code"));
        verifyNoInteractions(verifier);
        verify(subscriptions, never()).save(any());
    }

    @Test
    void confirmationResultMustStillMatchTheStoredOrderBeforeActivation() {
        Payment payment = new Payment(user, "ddarung-order-recheck", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(events.findByProviderAndEventId("TOSS", "event-recheck")).thenReturn(Optional.empty());
        when(verifier.verify("key-recheck"))
                .thenReturn(new VerifiedTossPayment("ddarung-order-recheck", "key-recheck", 2900, "KRW", "IN_PROGRESS"))
                .thenReturn(new VerifiedTossPayment("ddarung-order-recheck", "key-recheck", 1, "KRW", "DONE"));
        when(payments.findByOrderId("ddarung-order-recheck")).thenReturn(Optional.of(payment));

        var result = service.processWebhook("event-recheck", "key-recheck");

        assertEquals("PAYMENT_VERIFICATION_FAILED", result.get("code"));
        verify(subscriptions, never()).save(any());
    }

    @Test
    void mismatchedAmountDoesNotActivateSubscription() {
        Payment payment = new Payment(user, "ddarung-order-2", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(events.findByProviderAndEventId("TOSS", "event-2")).thenReturn(Optional.empty());
        when(verifier.verify("key-2")).thenReturn(new VerifiedTossPayment("ddarung-order-2", "key-2", 1, "KRW", "DONE"));
        when(payments.findByOrderId("ddarung-order-2")).thenReturn(Optional.of(payment));

        var result = service.processWebhook("event-2", "key-2");

        assertEquals("PAYMENT_VERIFICATION_FAILED", result.get("code"));
        verify(subscriptions, never()).save(any());
        verify(events).save(any(PaymentEvent.class));
    }

    @Test
    void duplicateWebhookDoesNotReverifyOrActivateAgain() {
        when(events.findByProviderAndEventId("TOSS", "event-3"))
                .thenReturn(Optional.of(new PaymentEvent("TOSS", "event-3", PaymentEventOutcome.ACTIVE)));

        var result = service.processWebhook("event-3", "key-3");

        assertEquals("ACTIVE", result.get("status"));
        verifyNoInteractions(verifier);
        verify(subscriptions, never()).save(any());
    }

    @Test
    void failedWebhookReusesTheFirstVerificationFailure() {
        when(events.findByProviderAndEventId("TOSS", "event-4"))
                .thenReturn(Optional.of(new PaymentEvent("TOSS", "event-4", PaymentEventOutcome.VERIFICATION_FAILED)));

        var result = service.processWebhook("event-4", "key-4");

        assertEquals("PAYMENT_VERIFICATION_FAILED", result.get("code"));
        verifyNoInteractions(verifier);
        verify(events, never()).save(any());
    }

    @Test
    void canceledTossPaymentDoesNotActivateSubscription() {
        Payment payment = new Payment(user, "ddarung-order-3", SubscriptionPlan.PREMIUM_MONTHLY_30D);
        when(events.findByProviderAndEventId("TOSS", "event-5")).thenReturn(Optional.empty());
        when(verifier.verify("key-5")).thenReturn(new VerifiedTossPayment("ddarung-order-3", "key-5", 2900, "KRW", "CANCELED"));
        when(payments.findByOrderId("ddarung-order-3")).thenReturn(Optional.of(payment));

        var result = service.processWebhook("event-5", "key-5");

        assertEquals("PAYMENT_VERIFICATION_FAILED", result.get("code"));
        assertEquals(PaymentStatus.CANCELED, payment.getStatus());
        verify(subscriptions, never()).save(any());
    }

    @Test
    void webhookVerificationFailureIsExposedAsUnauthorized() {
        SubscriptionService controllerService = mock(SubscriptionService.class);
        PaymentController controller = new PaymentController(controllerService);
        when(controllerService.processWebhook("event-6", "key-6"))
                .thenReturn(java.util.Map.of("code", "PAYMENT_VERIFICATION_FAILED"));

        ResponseEntity<?> response = controller.webhook("event-6", new TossWebhookRequest("PAYMENT_STATUS_CHANGED", new TossWebhookRequest.PaymentData("key-6")));

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void productionCheckoutBlockIsExposedAsServiceUnavailable() {
        SubscriptionService controllerService = mock(SubscriptionService.class);
        PaymentController controller = new PaymentController(controllerService);
        when(controllerService.checkout(user, SubscriptionPlan.PREMIUM_MONTHLY_30D))
                .thenReturn(java.util.Map.of("code", "PAYMENT_NOT_ENABLED"));

        ResponseEntity<?> response = controller.checkout(new PrincipalDetails(user), java.util.Map.of("planId", "PREMIUM_MONTHLY_30D"));

        assertEquals(503, response.getStatusCode().value());
    }

    @Test
    void checkoutIsBlockedWhenTheSandboxSecretIsUnavailable() {
        SubscriptionService unavailable = new SubscriptionService(
            subscriptions, payments, events, verifier, new PaymentEnvironment("sandbox", ""), premiumNotifications
        );

        var result = unavailable.checkout(user, SubscriptionPlan.PREMIUM_MONTHLY_30D);

        assertEquals("PAYMENT_NOT_ENABLED", result.get("code"));
        verify(payments, never()).save(any());
    }

    @Test
    void checkoutIsBlockedInProductionEvenWhenAKeyExists() {
        SubscriptionService production = new SubscriptionService(
            subscriptions, payments, events, verifier, new PaymentEnvironment("production", "test_sk_sandbox"), premiumNotifications
        );

        var result = production.checkout(user, SubscriptionPlan.PREMIUM_MONTHLY_30D);

        assertEquals("PAYMENT_NOT_ENABLED", result.get("code"));
        verify(payments, never()).save(any());
    }
}
