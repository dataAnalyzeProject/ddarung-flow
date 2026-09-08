package com.ddarungflow.modelops;

import com.ddarungflow.inference.InferenceClient;
import com.ddarungflow.inference.InferenceDtos;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RuntimeModelRegistryService {
    private final ModelArtifactRepository artifactRepository;
    private final RuntimeModelSourceGateway sourceGateway;
    private final InferenceClient inferenceClient;

    public RuntimeModelRegistryService(ModelArtifactRepository artifactRepository,
                                       RuntimeModelSourceGateway sourceGateway,
                                       InferenceClient inferenceClient) {
        this.artifactRepository = artifactRepository;
        this.sourceGateway = sourceGateway;
        this.inferenceClient = inferenceClient;
    }

    @Transactional
    public ModelArtifact reconcile() {
        InferenceDtos.RuntimeModelResponse runtime = inferenceClient.runtimeModel();
        RuntimeModelSourceGateway.Source source = sourceGateway.read();
        InferenceDtos.RuntimeModelResponse confirmedRuntime = inferenceClient.runtimeModel();
        String expectedRuntimeSource = switch (source.pointerState()) {
            case "INACTIVE" -> "verified_inactive_pointer";
            case "ACTIVE" -> "verified_active_pointer";
            default -> "";
        };
        if (!runtime.modelVersion().equals(source.modelVersion())
                || !runtime.artifactSha256().equals(source.artifactSha256())
                || !confirmedRuntime.modelVersion().equals(source.modelVersion())
                || !confirmedRuntime.artifactSha256().equals(source.artifactSha256())
                || !runtime.modelSource().equals(expectedRuntimeSource)
                || !confirmedRuntime.modelSource().equals(expectedRuntimeSource)
                || source.modelVersion().length() > 100
                || source.artifactKey().length() > 512
                || source.manifestKey().length() > 512) {
            throw new RuntimeMismatchException();
        }
        ModelArtifact active = artifactRepository.findFirstByState(ModelArtifactState.ACTIVE).orElse(null);
        if (active != null) {
            if (active.getVersion().equals(runtime.modelVersion()) && active.getSha256().equals(runtime.artifactSha256())) {
                return active;
            }
            throw new RuntimeMismatchException();
        }
        if (artifactRepository.existsByVersion(source.modelVersion()) || artifactRepository.existsBySha256(source.artifactSha256())) {
            throw new RuntimeMismatchException();
        }
        return artifactRepository.save(ModelArtifact.importedRuntime(
            source.modelVersion(), source.artifactKey(), source.artifactSha256(),
            source.manifestKey(), source.manifestSha256(), confirmedRuntime.loadedAt()
        ));
    }

    public static class RuntimeMismatchException extends RuntimeException { }
}
