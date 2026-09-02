package com.ddarungflow.payment;

import com.ddarungflow.entity.Users;
import org.springframework.stereotype.Service;

@Service
public class PremiumEntitlementService {
    private final SubscriptionService subscriptions;

    public PremiumEntitlementService(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    public void requireActive(Users user) {
        try {
            Object status = subscriptions.current(user).get("status");
            if (!"ACTIVE".equals(status)) {
                throw new PremiumRequired();
            }
        } catch (PremiumRequired exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new EntitlementUnavailable();
        }
    }

    public static class PremiumRequired extends RuntimeException { }
    public static class EntitlementUnavailable extends RuntimeException { }
}
