package com.ddarungflow.ridingguide;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.payment.PremiumEntitlementService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RidingGuideControllerTest {
    private final RidingGuideService service = mock(RidingGuideService.class);
    private final RidingGuideController controller = new RidingGuideController(service);

    @Test
    void delegatesAuthenticatedRequestAndRequiresStationIdThroughServiceContract() {
        Users user = Users.builder().provider("test").providerUserId("guide-user").displayName("guide").build();
        PrincipalDetails principal = new PrincipalDetails(user);
        RidingGuideDtos.Request request = new RidingGuideDtos.Request("ST-4", null, null, null,
                null, null, null, null);
        RidingGuideDtos.Response expected = new RidingGuideDtos.Response(
                "ST-4", RidingGuideDtos.Status.PARTIAL, RidingGuideDtos.AiStatus.PARTIAL,
                "RENTAL_CONTEXT_MISSING", new ConsumerAiEvidenceBundle(Map.of(), Map.of(), Map.of(), Map.of(), Map.of()),
                null, List.of(), null, List.of(), List.of("RENTAL_CONTEXT_MISSING"));
        when(service.generate(user, request)).thenReturn(expected);

        assertThat(controller.generate(principal, request)).isEqualTo(expected);
        verify(service).generate(user, request);
        assertThatThrownBy(() -> controller.generate(null, request))
                .isInstanceOf(RidingGuideController.Unauthorized.class);
    }

    @Test
    void mapsValidationAndEntitlementFailuresToStableCodes() {
        assertThat(controller.invalid().getStatusCode().value()).isEqualTo(400);
        assertThat(controller.invalid().getBody()).containsEntry("code", "RIDING_GUIDE_INVALID");
        assertThat(controller.premiumRequired().getStatusCode().value()).isEqualTo(403);
        assertThat(controller.premiumRequired().getBody()).containsEntry("code", "PREMIUM_REQUIRED");
        assertThat(controller.entitlementUnavailable().getStatusCode().value()).isEqualTo(503);
        assertThat(controller.entitlementUnavailable().getBody())
                .containsEntry("code", "PREMIUM_ENTITLEMENT_UNAVAILABLE");
    }
}
