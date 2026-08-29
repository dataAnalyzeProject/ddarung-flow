package com.ddarungflow.admin.operations;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@org.springframework.stereotype.Component
public class AdminOpsRiskPolicy {
    public static final String RULE_VERSION = "OPS_RENTAL_RISK_V1";
    private static final BigDecimal ZERO = BigDecimal.ZERO;
    private static final BigDecimal ONE = BigDecimal.ONE;

    public BigDecimal shortage(BigDecimal atLeast) {
        return atLeast == null ? null : ONE.subtract(atLeast).max(ZERO).min(ONE).setScale(7, RoundingMode.HALF_UP);
    }

    public String band(BigDecimal shortage) {
        if (shortage == null) return null;
        if (shortage.compareTo(new BigDecimal("0.80")) >= 0) return "CRITICAL";
        if (shortage.compareTo(new BigDecimal("0.60")) >= 0) return "HIGH";
        if (shortage.compareTo(new BigDecimal("0.40")) >= 0) return "WATCH";
        return "LOW";
    }

    public BigDecimal selected(List<BigDecimal> atLeast, int requiredBikeCount) {
        return shortage(atLeast.get(requiredBikeCount - 1));
    }
}
