package com.ddarungflow.modelops;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "model_artifacts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ModelArtifact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String version;

    @Column(name = "trainer_user_id", nullable = false)
    private Long trainerUserId;

    @Column(name = "artifact_key", nullable = false, length = 512)
    private String artifactKey;

    @Column(nullable = false, unique = true, length = 64)
    private String sha256;

    @Column(name = "code_commit", nullable = false, length = 40)
    private String codeCommit;

    @Column(name = "data_manifest_hash", nullable = false, length = 64)
    private String dataManifestHash;

    @Column(name = "config_hash", nullable = false, length = 64)
    private String configHash;

    @Column(name = "feature_schema_version", nullable = false, length = 64)
    private String featureSchemaVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ModelArtifactState state;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public ModelArtifact(
        String version,
        Long trainerUserId,
        String artifactKey,
        String sha256,
        String codeCommit,
        String dataManifestHash,
        String configHash,
        String featureSchemaVersion,
        ModelArtifactState state,
        OffsetDateTime createdAt
    ) {
        this.version = version;
        this.trainerUserId = trainerUserId;
        this.artifactKey = artifactKey;
        this.sha256 = sha256;
        this.codeCommit = codeCommit;
        this.dataManifestHash = dataManifestHash;
        this.configHash = configHash;
        this.featureSchemaVersion = featureSchemaVersion;
        this.state = state;
        this.createdAt = createdAt;
    }
}
