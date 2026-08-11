package com.ddarungflow.modelops;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ModelRegistryServiceTest {

    @Mock
    private ModelArtifactRepository artifactRepository;

    @Mock
    private ModelEvaluationRepository evaluationRepository;

    @InjectMocks
    private ModelRegistryService registryService;

    private static final String SHA256_1 = "1111111111111111111111111111111111111111111111111111111111111111";
    private static final String SHA256_2 = "2222222222222222222222222222222222222222222222222222222222222222";
    private static final String SHA256_3 = "3333333333333333333333333333333333333333333333333333333333333333";

    @Test
    @DisplayName("registersValidDraftAndRejectsDuplicateVersionOrChecksum: DRAFT 등록 성공 및 version/checksum 중복 거부")
    void registersValidDraftAndRejectsDuplicateVersionOrChecksum() {
        // given
        OffsetDateTime createdAt = OffsetDateTime.now();
        ModelArtifact draft = new ModelArtifact(
            "v1.0.0", 1L, "s3://models/v1.onnx", SHA256_1,
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", SHA256_2, SHA256_3,
            "v1.0", ModelArtifactState.DRAFT, createdAt
        );

        given(artifactRepository.existsByVersion("v1.0.0")).willReturn(false);
        given(artifactRepository.existsBySha256(SHA256_1)).willReturn(false);
        given(artifactRepository.save(any(ModelArtifact.class))).willAnswer(inv -> inv.getArgument(0));

        // when
        ModelArtifact registered = registryService.registerDraft(draft);

        // then
        assertThat(registered).isNotNull();
        assertThat(registered.getVersion()).isEqualTo("v1.0.0");
        assertThat(registered.getState()).isEqualTo(ModelArtifactState.DRAFT);
        verify(artifactRepository).save(draft);

        // test duplicate version
        given(artifactRepository.existsByVersion("v1.0.0")).willReturn(true);
        assertThatThrownBy(() -> registryService.registerDraft(draft))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Duplicate version");

        // test duplicate checksum
        ModelArtifact draft2 = new ModelArtifact(
            "v1.0.1", 1L, "s3://models/v1.onnx", SHA256_1,
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", SHA256_2, SHA256_3,
            "v1.0", ModelArtifactState.DRAFT, createdAt
        );
        given(artifactRepository.existsByVersion("v1.0.1")).willReturn(false);
        given(artifactRepository.existsBySha256(SHA256_1)).willReturn(true);

        assertThatThrownBy(() -> registryService.registerDraft(draft2))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Duplicate sha256");
    }

    @Test
    @DisplayName("savesExactlyTwentyUniqueEvaluationCombinations: H1..H4 x 1..5의 정확히 20개 조합 검증")
    void savesExactlyTwentyUniqueEvaluationCombinations() {
        // given
        Long modelId = 10L;
        given(artifactRepository.existsById(modelId)).willReturn(true);

        List<ModelEvaluation> validRows = create20ValidEvaluations(modelId);
        given(evaluationRepository.saveAll(any())).willAnswer(inv -> inv.getArgument(0));

        // when
        List<ModelEvaluation> saved = registryService.saveEvaluations(modelId, validRows);

        // then
        assertThat(saved).hasSize(20);
        verify(evaluationRepository).saveAll(validRows);

        // test wrong count (19 rows)
        List<ModelEvaluation> nineteenRows = validRows.subList(0, 19);
        assertThatThrownBy(() -> registryService.saveEvaluations(modelId, nineteenRows))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("exactly 20 rows");

        // test wrong count (21 rows)
        List<ModelEvaluation> twentyOneRows = new ArrayList<>(validRows);
        twentyOneRows.add(new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("0.05"), new BigDecimal("0.90"),
            new BigDecimal("0.02"), new BigDecimal("0.95"), 0
        ));
        assertThatThrownBy(() -> registryService.saveEvaluations(modelId, twentyOneRows))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("exactly 20 rows");

        // test duplicate combination (20 rows but non-unique combinations)
        List<ModelEvaluation> dupRows = new ArrayList<>(validRows);
        dupRows.set(1, dupRows.get(0)); // replace second row with copy of first row
        assertThatThrownBy(() -> registryService.saveEvaluations(modelId, dupRows))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("all 20 unique combinations");
    }

    @Test
    @DisplayName("allowsOnlyAssigneeOwnedModelTransitions: DRAFT->VALIDATED->APPROVED/REJECTED 전이 허용 및 비허용 전이 거부")
    void allowsOnlyAssigneeOwnedModelTransitions() {
        // given
        Long modelId = 1L;
        OffsetDateTime now = OffsetDateTime.now();

        ModelArtifact draftArtifact = new ModelArtifact(
            "v1.0.0", 1L, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.DRAFT, now
        );

        given(artifactRepository.findById(modelId)).willReturn(Optional.of(draftArtifact));
        given(artifactRepository.save(any(ModelArtifact.class))).willAnswer(inv -> inv.getArgument(0));

        // DRAFT -> VALIDATED without 20 evaluations should fail
        given(evaluationRepository.findAllByModelId(modelId)).willReturn(Collections.emptyList());
        assertThatThrownBy(() -> registryService.transition(modelId, ModelArtifactState.VALIDATED))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("without exactly 20 evaluations");

        // DRAFT -> VALIDATED with 20 evaluations should succeed
        given(evaluationRepository.findAllByModelId(modelId)).willReturn(create20ValidEvaluations(modelId));
        ModelArtifact validated = registryService.transition(modelId, ModelArtifactState.VALIDATED);
        assertThat(validated.getState()).isEqualTo(ModelArtifactState.VALIDATED);

        // DRAFT -> APPROVED directly should fail
        ModelArtifact draftArtifact2 = new ModelArtifact(
            "v1.0.0", 1L, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.DRAFT, now
        );
        given(artifactRepository.findById(2L)).willReturn(Optional.of(draftArtifact2));
        assertThatThrownBy(() -> registryService.transition(2L, ModelArtifactState.APPROVED))
            .isInstanceOf(IllegalStateException.class);

        // VALIDATED -> APPROVED
        ModelArtifact validatedArtifact = new ModelArtifact(
            "v1.0.0", 1L, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.VALIDATED, now
        );
        given(artifactRepository.findById(3L)).willReturn(Optional.of(validatedArtifact));
        ModelArtifact approved = registryService.transition(3L, ModelArtifactState.APPROVED);
        assertThat(approved.getState()).isEqualTo(ModelArtifactState.APPROVED);

        // Transition to ACTIVE or RETIRED should be rejected (lead role only)
        assertThatThrownBy(() -> registryService.transition(3L, ModelArtifactState.ACTIVE))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("reserved for team lead service");
    }

    @Test
    @DisplayName("rejectsBlankVersionOrMissingTrainer: blank version 또는 trainer 누락 거부")
    void rejectsBlankVersionOrMissingTrainer() {
        OffsetDateTime now = OffsetDateTime.now();

        // null version
        assertThatThrownBy(() -> registryService.registerDraft(new ModelArtifact(
            null, 1L, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.DRAFT, now
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("version must not be null or blank");

        // missing trainer
        assertThatThrownBy(() -> registryService.registerDraft(new ModelArtifact(
            "v1.0.0", null, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.DRAFT, now
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("trainerUserId must not be null");
    }

    @Test
    @DisplayName("validatesBrierScoreAndCalibrationErrorRange: brierScore 및 calibrationError 범위(0..1) 검증 - 0과 1은 허용, 1.01은 거부")
    void validatesBrierScoreAndCalibrationErrorRange() {
        Long modelId = 1L;

        // 0 and 1 succeed for brierScore
        ModelEvaluation valid0 = new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("0"), new BigDecimal("0.5"),
            new BigDecimal("0.5"), new BigDecimal("0.5"), 0
        );
        assertThat(valid0.getBrierScore()).isEqualTo(new BigDecimal("0"));

        ModelEvaluation valid1 = new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("1"), new BigDecimal("0.5"),
            new BigDecimal("0.5"), new BigDecimal("0.5"), 0
        );
        assertThat(valid1.getBrierScore()).isEqualTo(new BigDecimal("1"));

        // 1.01 fails for brierScore
        assertThatThrownBy(() -> new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("1.01"), new BigDecimal("0.5"),
            new BigDecimal("0.5"), new BigDecimal("0.5"), 0
        )).isInstanceOf(IllegalArgumentException.class);

        // 0 and 1 succeed for calibrationError
        ModelEvaluation validCal0 = new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("0.5"), new BigDecimal("0.5"),
            new BigDecimal("0"), new BigDecimal("0.5"), 0
        );
        assertThat(validCal0.getCalibrationError()).isEqualTo(new BigDecimal("0"));

        ModelEvaluation validCal1 = new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("0.5"), new BigDecimal("0.5"),
            new BigDecimal("1"), new BigDecimal("0.5"), 0
        );
        assertThat(validCal1.getCalibrationError()).isEqualTo(new BigDecimal("1"));

        // 1.01 fails for calibrationError
        assertThatThrownBy(() -> new ModelEvaluation(
            modelId, 60, 1, 1000L,
            new BigDecimal("0.5"), new BigDecimal("0.5"),
            new BigDecimal("1.01"), new BigDecimal("0.5"), 0
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("rejectsTransitionToValidatedWhenEvaluationsContainDuplicates: 20행이지만 중복 조합이 있는 경우 DRAFT 유지 및 거부")
    void rejectsTransitionToValidatedWhenEvaluationsContainDuplicates() {
        Long modelId = 1L;
        OffsetDateTime now = OffsetDateTime.now();

        ModelArtifact draftArtifact = new ModelArtifact(
            "v1.0.0", 1L, "key", SHA256_1, "commit", SHA256_2, SHA256_3,
            "v1", ModelArtifactState.DRAFT, now
        );

        List<ModelEvaluation> dupEvaluations = create20ValidEvaluations(modelId);
        dupEvaluations.set(1, dupEvaluations.get(0)); // 20 rows, but duplicate combination

        given(artifactRepository.findById(modelId)).willReturn(Optional.of(draftArtifact));
        given(evaluationRepository.findAllByModelId(modelId)).willReturn(dupEvaluations);

        assertThatThrownBy(() -> registryService.transition(modelId, ModelArtifactState.VALIDATED))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("unique combinations");

        assertThat(draftArtifact.getState()).isEqualTo(ModelArtifactState.DRAFT);
    }

    private List<ModelEvaluation> create20ValidEvaluations(Long modelId) {
        List<ModelEvaluation> list = new ArrayList<>();
        int[] horizons = {60, 120, 180, 240};
        for (int h : horizons) {
            for (int b = 1; b <= 5; b++) {
                list.add(new ModelEvaluation(
                    modelId, h, b, 1000L,
                    new BigDecimal("0.05"), new BigDecimal("0.90"),
                    new BigDecimal("0.02"), new BigDecimal("0.95"), 0
                ));
            }
        }
        return list;
    }
}
