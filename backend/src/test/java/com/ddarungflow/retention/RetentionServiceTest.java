package com.ddarungflow.retention;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

@Disabled("TODO(EXP-BE-2): enable tests one at a time")
class RetentionServiceTest {
    @Test void dataIsIsolatedByUser() {}
    @Test void duplicateFavoriteIsRejected() {}
    @Test void predictionHistoryIsNewestFirst() {}
    @Test void notificationReadIsIdempotent() {}
    @Test void accountDeletionEnumeratesPersonalData() {}
}
