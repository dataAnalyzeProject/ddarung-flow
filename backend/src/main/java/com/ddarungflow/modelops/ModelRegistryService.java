package com.ddarungflow.modelops;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Transactional
public class ModelRegistryService {

    private static final Set<Integer> ALLOWED_HORIZONS = new HashSet<>(Arrays.asList(60, 120, 180, 240));
    private static final Set<Integer> ALLOWED_BIKE_COUNTS = new HashSet<>(Arrays.asList(1, 2, 3, 4, 5));

    private final ModelArtifactRepository artifactRepository;
    private final ModelEvaluationRepository evaluationRepository;

    public ModelRegistryService(
        ModelArtifactRepository artifactRepository,
        ModelEvaluationRepository evaluationRepository
    ) {
        this.artifactRepository = artifactRepository;
        this.evaluationRepository = evaluationRepository;
    }

    public ModelArtifact registerDraft(ModelArtifact draft) {
        if (draft == null) {
            throw new IllegalArgumentException("Draft artifact must not be null");
        }
        if (draft.getVersion() == null || draft.getVersion().isBlank() || draft.getVersion().length() > 100) {
            throw new IllegalArgumentException("version must not be null or blank, max length 100");
        }
        if (draft.getTrainerUserId() == null) {
            throw new IllegalArgumentException("trainerUserId must not be null");
        }
        if (draft.getArtifactKey() == null || draft.getArtifactKey().isBlank() || draft.getArtifactKey().length() > 512) {
            throw new IllegalArgumentException("artifactKey must not be null or blank, max length 512");
        }
        if (!isValidSha256(draft.getSha256())) {
            throw new IllegalArgumentException("sha256 must be a 64-character lowercase hexadecimal string");
        }
        if (draft.getCodeCommit() == null || draft.getCodeCommit().isBlank() || draft.getCodeCommit().length() > 40) {
            throw new IllegalArgumentException("codeCommit must not be null or blank, max length 40");
        }
        if (!isValidSha256(draft.getDataManifestHash())) {
            throw new IllegalArgumentException("dataManifestHash must be a 64-character lowercase hexadecimal string");
        }
        if (!isValidSha256(draft.getConfigHash())) {
            throw new IllegalArgumentException("configHash must be a 64-character lowercase hexadecimal string");
        }
        if (draft.getFeatureSchemaVersion() == null || draft.getFeatureSchemaVersion().isBlank() || draft.getFeatureSchemaVersion().length() > 64) {
            throw new IllegalArgumentException("featureSchemaVersion must not be null or blank, max length 64");
        }
        if (draft.getState() != ModelArtifactState.DRAFT) {
            throw new IllegalArgumentException("Initial artifact state must be DRAFT");
        }
        if (draft.getCreatedAt() == null) {
            throw new IllegalArgumentException("createdAt must not be null");
        }

        if (artifactRepository.existsByVersion(draft.getVersion())) {
            throw new IllegalArgumentException("Duplicate version: " + draft.getVersion());
        }
        if (artifactRepository.existsBySha256(draft.getSha256())) {
            throw new IllegalArgumentException("Duplicate sha256: " + draft.getSha256());
        }

        return artifactRepository.save(draft);
    }

    public List<ModelEvaluation> saveEvaluations(Long modelId, List<ModelEvaluation> rows) {
        if (modelId == null) {
            throw new IllegalArgumentException("modelId must not be null");
        }
        if (!artifactRepository.existsById(modelId)) {
            throw new IllegalArgumentException("ModelArtifact not found with id: " + modelId);
        }
        if (rows == null || rows.size() != 20) {
            throw new IllegalArgumentException("Evaluations list must contain exactly 20 rows");
        }

        Set<String> combinations = new HashSet<>();
        for (ModelEvaluation row : rows) {
            if (row == null) {
                throw new IllegalArgumentException("Evaluation row must not be null");
            }
            if (!modelId.equals(row.getModelId())) {
                throw new IllegalArgumentException("ModelEvaluation modelId does not match given modelId: " + modelId);
            }
            if (!ALLOWED_HORIZONS.contains(row.getHorizonMinutes())) {
                throw new IllegalArgumentException("Invalid horizonMinutes: " + row.getHorizonMinutes());
            }
            if (!ALLOWED_BIKE_COUNTS.contains(row.getRequiredBikeCount())) {
                throw new IllegalArgumentException("Invalid requiredBikeCount: " + row.getRequiredBikeCount());
            }
            if (row.getSampleCount() == null || row.getSampleCount() < 0) {
                throw new IllegalArgumentException("sampleCount must be non-null and non-negative");
            }
            if (row.getBrierScore() == null || row.getBrierScore().compareTo(BigDecimal.ZERO) < 0 || row.getBrierScore().compareTo(BigDecimal.ONE) > 0) {
                throw new IllegalArgumentException("brierScore must be between 0.0 and 1.0");
            }
            if (row.getShortageRecall() == null || row.getShortageRecall().compareTo(BigDecimal.ZERO) < 0 || row.getShortageRecall().compareTo(BigDecimal.ONE) > 0) {
                throw new IllegalArgumentException("shortageRecall must be between 0.0 and 1.0");
            }
            if (row.getCalibrationError() == null || row.getCalibrationError().compareTo(BigDecimal.ZERO) < 0 || row.getCalibrationError().compareTo(BigDecimal.ONE) > 0) {
                throw new IllegalArgumentException("calibrationError must be between 0.0 and 1.0");
            }
            if (row.getCoverage() == null || row.getCoverage().compareTo(BigDecimal.ZERO) < 0 || row.getCoverage().compareTo(BigDecimal.ONE) > 0) {
                throw new IllegalArgumentException("coverage must be between 0.0 and 1.0");
            }
            if (row.getMonotonicityViolations() == null || row.getMonotonicityViolations() < 0) {
                throw new IllegalArgumentException("monotonicityViolations must be non-null and non-negative");
            }

            combinations.add(row.getHorizonMinutes() + ":" + row.getRequiredBikeCount());
        }

        if (combinations.size() != 20) {
            throw new IllegalArgumentException("Evaluations must cover all 20 unique combinations of H1..H4 x 1..5 required bikes");
        }

        return evaluationRepository.saveAll(rows);
    }

    public ModelArtifact transition(Long modelId, ModelArtifactState target) {
        if (modelId == null || target == null) {
            throw new IllegalArgumentException("modelId and target state must not be null");
        }
        ModelArtifact artifact = artifactRepository.findById(modelId)
            .orElseThrow(() -> new IllegalArgumentException("ModelArtifact not found with id: " + modelId));

        if (target == ModelArtifactState.ACTIVE || target == ModelArtifactState.RETIRED) {
            throw new IllegalArgumentException("ACTIVE and RETIRED transitions are reserved for team lead service");
        }

        ModelArtifactState current = artifact.getState();
        if (current == ModelArtifactState.DRAFT) {
            if (target != ModelArtifactState.VALIDATED) {
                throw new IllegalStateException("DRAFT state can only transition to VALIDATED");
            }
            List<ModelEvaluation> evaluations = evaluationRepository.findAllByModelId(modelId);
            if (evaluations.size() != 20) {
                throw new IllegalStateException("Cannot transition DRAFT model to VALIDATED without exactly 20 evaluations (found " + evaluations.size() + ")");
            }
            Set<String> combinations = new HashSet<>();
            for (ModelEvaluation row : evaluations) {
                if (row != null && ALLOWED_HORIZONS.contains(row.getHorizonMinutes()) && ALLOWED_BIKE_COUNTS.contains(row.getRequiredBikeCount())) {
                    combinations.add(row.getHorizonMinutes() + ":" + row.getRequiredBikeCount());
                }
            }
            if (combinations.size() != 20) {
                throw new IllegalStateException("Cannot transition DRAFT model to VALIDATED: evaluations must cover all 20 unique combinations");
            }
        } else if (current == ModelArtifactState.VALIDATED) {
            if (target != ModelArtifactState.APPROVED && target != ModelArtifactState.REJECTED) {
                throw new IllegalStateException("VALIDATED state can only transition to APPROVED or REJECTED");
            }
        } else {
            throw new IllegalStateException("Cannot transition from terminal state: " + current);
        }

        artifact.transitionTo(target);
        return artifactRepository.save(artifact);
    }

    @Transactional(readOnly = true)
    public List<ModelArtifact> findAll() {
        return artifactRepository.findAll();
    }

    @Transactional(readOnly = true)
    public List<ModelEvaluation> findEvaluations(Long modelId) {
        if (modelId == null || !artifactRepository.existsById(modelId)) {
            throw new IllegalArgumentException("ModelArtifact not found with id: " + modelId);
        }
        return evaluationRepository.findAllByModelId(modelId);
    }

    private static boolean isValidSha256(String hash) {
        return hash != null && hash.matches("^[0-9a-f]{64}$");
    }
}
