package com.ddarungflow.modelops;

import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

@ExtendWith(MockitoExtension.class)
class RuntimeModelRegistryServiceTest {
    private static final String SHA = "a".repeat(64);
    private static final String MANIFEST_SHA = "b".repeat(64);
    private static final OffsetDateTime LOADED_AT = OffsetDateTime.parse("2026-09-08T06:00:00Z");

    @Mock ModelArtifactRepository repository;
    @Mock RuntimeModelSourceGateway sourceGateway;
    @Mock InferenceClient inferenceClient;
    RuntimeModelRegistryService service;

    @BeforeEach
    void setUp() {
        service = new RuntimeModelRegistryService(repository, sourceGateway, inferenceClient);
        given(inferenceClient.runtimeModel()).willReturn(new InferenceDtos.RuntimeModelResponse(
            "NORMAL", "runtime-v1", SHA, "verified_inactive_pointer", LOADED_AT,
            List.of(60, 120, 180, 240), List.of(1, 2, 3, 4, 5)
        ));
        given(sourceGateway.read()).willReturn(new RuntimeModelSourceGateway.Source(
            "runtime-v1", "private-artifact", SHA, "private-manifest", MANIFEST_SHA, "INACTIVE"
        ));
    }

    @Test
    void importsMatchingRuntimeWithoutExposingOrInventingTrainingMetadata() {
        given(repository.findFirstByState(ModelArtifactState.ACTIVE)).willReturn(Optional.empty());
        given(repository.existsByVersion("runtime-v1")).willReturn(false);
        given(repository.existsBySha256(SHA)).willReturn(false);
        given(repository.save(any(ModelArtifact.class))).willAnswer(invocation -> invocation.getArgument(0));

        ModelArtifact result = service.reconcile();

        assertThat(result.getState()).isEqualTo(ModelArtifactState.ACTIVE);
        assertThat(result.getVersion()).isEqualTo("runtime-v1");
        assertThat(result.getSha256()).isEqualTo(SHA);
        assertThat(result.getTrainerUserId()).isNull();
        assertThat(result.getCodeCommit()).isNull();
    }

    @Test
    void rejectsSourceThatDoesNotMatchActualRuntimeReadback() {
        given(sourceGateway.read()).willReturn(new RuntimeModelSourceGateway.Source(
            "other", "private-artifact", SHA, "private-manifest", MANIFEST_SHA, "INACTIVE"
        ));

        assertThatThrownBy(() -> service.reconcile())
            .isInstanceOf(RuntimeModelRegistryService.RuntimeMismatchException.class);
    }

    @Test
    void rejectsNonPointerRuntimeEvenWhenVersionAndArtifactMatch() {
        given(inferenceClient.runtimeModel()).willReturn(new InferenceDtos.RuntimeModelResponse(
            "NORMAL", "runtime-v1", SHA, "local_verified", LOADED_AT,
            List.of(60, 120, 180, 240), List.of(1, 2, 3, 4, 5)
        ));

        assertThatThrownBy(() -> service.reconcile())
            .isInstanceOf(RuntimeModelRegistryService.RuntimeMismatchException.class);
    }

    @Test
    void rejectsPointerStateThatDoesNotMatchRuntimeSource() {
        given(sourceGateway.read()).willReturn(new RuntimeModelSourceGateway.Source(
            "runtime-v1", "private-artifact", SHA, "private-manifest", MANIFEST_SHA, "ACTIVE"
        ));

        assertThatThrownBy(() -> service.reconcile())
            .isInstanceOf(RuntimeModelRegistryService.RuntimeMismatchException.class);
    }

    @Test
    void isIdempotentOnlyForTheSameActiveRuntimeIdentity() {
        ModelArtifact active = ModelArtifact.importedRuntime(
            "runtime-v1", "private-artifact", SHA, "private-manifest", MANIFEST_SHA, LOADED_AT
        );
        given(repository.findFirstByState(ModelArtifactState.ACTIVE)).willReturn(Optional.of(active));

        assertThat(service.reconcile()).isSameAs(active);
    }
}
