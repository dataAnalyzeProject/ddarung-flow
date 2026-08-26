package com.ddarungflow.modelops;

import com.ddarungflow.audit.AuditEventService;
import com.ddarungflow.audit.AuditResult;
import com.ddarungflow.entity.UserRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ModelActivationServiceTest {
    @Mock private ModelArtifactRepository artifactRepository;
    @Mock private ActivationAttemptService attemptService;
    @Mock private ModelActivationGateway gateway;
    @Mock private AuditEventService auditEventService;
    @InjectMocks private ModelActivationService service;

    @Test
    void approvedCandidateIsReloadedBeforeDatabaseStateAndAudited() {
        ModelArtifact candidate = artifact("candidate", ModelArtifactState.APPROVED);
        ModelArtifact previous = artifact("previous", ModelArtifactState.ACTIVE);
        when(artifactRepository.findById(10L)).thenReturn(Optional.of(candidate));
        when(artifactRepository.findFirstByState(ModelArtifactState.ACTIVE)).thenReturn(Optional.of(previous));
        when(attemptService.start(nullable(Long.class), nullable(Long.class), anyLong(), anyString(), any())).thenReturn(ActivationAttempt.builder().candidateModelId(10L).previousModelId(9L).actorUserId(1L).correlationId("corr").startedAt(OffsetDateTime.now()).build());

        ModelActivationService.ActivationResult result = service.activate(10L, 1L, UserRole.ADMIN);

        assertThat(result.finalState()).isEqualTo(ModelArtifactState.ACTIVE);
        assertThat(candidate.getState()).isEqualTo(ModelArtifactState.ACTIVE);
        assertThat(previous.getState()).isEqualTo(ModelArtifactState.RETIRED);
        verify(gateway).activate(candidate);
        verify(artifactRepository).save(previous);
        verify(artifactRepository).save(candidate);
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("MODEL_ACTIVATE"), eq("MODEL"), anyString(), eq(AuditResult.SUCCESS), isNull(), anyString(), any());
    }

    @Test
    void failedReloadRestoresPreviousActiveAndDoesNotChangeDatabaseState() {
        ModelArtifact candidate = artifact("candidate", ModelArtifactState.APPROVED);
        ModelArtifact previous = artifact("previous", ModelArtifactState.ACTIVE);
        when(artifactRepository.findById(10L)).thenReturn(Optional.of(candidate));
        when(artifactRepository.findFirstByState(ModelArtifactState.ACTIVE)).thenReturn(Optional.of(previous));
        when(attemptService.start(nullable(Long.class), nullable(Long.class), anyLong(), anyString(), any())).thenReturn(ActivationAttempt.builder().candidateModelId(10L).previousModelId(9L).actorUserId(1L).correlationId("corr").startedAt(OffsetDateTime.now()).build());
        doThrow(new RuntimeException()).when(gateway).activate(candidate);

        assertThatThrownBy(() -> service.activate(10L, 1L, UserRole.ADMIN)).isInstanceOf(ModelActivationService.ActivationFailedException.class);

        assertThat(candidate.getState()).isEqualTo(ModelArtifactState.APPROVED);
        assertThat(previous.getState()).isEqualTo(ModelArtifactState.ACTIVE);
        verify(gateway).activate(previous);
        verify(artifactRepository, never()).save(any());
        verify(auditEventService).appendEvent(eq(1L), eq(UserRole.ADMIN), eq("MODEL_ACTIVATE"), eq("MODEL"), anyString(), eq(AuditResult.FAILURE), eq("POST_SWITCH_SMOKE_FAILED"), anyString(), any());
    }

    private ModelArtifact artifact(String version, ModelArtifactState state) {
        return new ModelArtifact(version, 1L, "models/" + version + ".joblib", "a".repeat(64), "abc123", "b".repeat(64), "c".repeat(64), "v1", "models/" + version + ".json", "d".repeat(64), state, OffsetDateTime.now());
    }
}
