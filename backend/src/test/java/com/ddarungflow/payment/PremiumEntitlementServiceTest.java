package com.ddarungflow.payment;

import com.ddarungflow.entity.Users;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PremiumEntitlementServiceTest {
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final PremiumEntitlementService service = new PremiumEntitlementService(subscriptions);
    private final Users user = Users.builder().provider("test").providerUserId("premium-user").displayName("tester").build();

    @Test
    void allowsAnActiveSubscription() {
        when(subscriptions.current(user)).thenReturn(Map.of("status", "ACTIVE"));

        assertThatCode(() -> service.requireActive(user)).doesNotThrowAnyException();
    }

    @Test
    void rejectsFreeAndExpiredSubscriptions() {
        when(subscriptions.current(user)).thenReturn(Map.of("status", "FREE"), Map.of("status", "EXPIRED"));

        assertThatThrownBy(() -> service.requireActive(user))
                .isInstanceOf(PremiumEntitlementService.PremiumRequired.class);
        assertThatThrownBy(() -> service.requireActive(user))
                .isInstanceOf(PremiumEntitlementService.PremiumRequired.class);
    }

    @Test
    void failsClosedWhenTheEntitlementCannotBeRead() {
        when(subscriptions.current(user)).thenThrow(new IllegalStateException("database unavailable"));

        assertThatThrownBy(() -> service.requireActive(user))
                .isInstanceOf(PremiumEntitlementService.EntitlementUnavailable.class);
    }
}
