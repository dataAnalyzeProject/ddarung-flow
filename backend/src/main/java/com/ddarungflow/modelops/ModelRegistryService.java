package com.ddarungflow.modelops;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ModelRegistryService {

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
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): validate and register a DRAFT artifact");
    }

    public List<ModelEvaluation> saveEvaluations(Long modelId, List<ModelEvaluation> rows) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): validate and save exactly 20 evaluation rows");
    }

    public ModelArtifact transition(Long modelId, ModelArtifactState target) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): enforce the assignee-owned state transitions");
    }
}
