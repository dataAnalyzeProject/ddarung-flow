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
        if (version == null || version.isBlank() || version.length() > 100) {
            throw new IllegalArgumentException("version must not be null or blank, max length 100");
        }
        if (trainerUserId == null) {
            throw new IllegalArgumentException("trainerUserId must not be null");
        }
        if (artifactKey == null || artifactKey.isBlank() || artifactKey.length() > 512) {
            throw new IllegalArgumentException("artifactKey must not be null or blank, max length 512");
        }
        if (sha256 == null || !sha256.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("sha256 must be a 64-character lowercase hexadecimal string");
        }
        if (codeCommit == null || codeCommit.isBlank() || codeCommit.length() > 40) {
            throw new IllegalArgumentException("codeCommit must not be null or blank, max length 40");
        }
        if (dataManifestHash == null || !dataManifestHash.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("dataManifestHash must be a 64-character lowercase hexadecimal string");
        }
        if (configHash == null || !configHash.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("configHash must be a 64-character lowercase hexadecimal string");
        }
        if (featureSchemaVersion == null || featureSchemaVersion.isBlank() || featureSchemaVersion.length() > 64) {
            throw new IllegalArgumentException("featureSchemaVersion must not be null or blank, max length 64");
        }
        if (state == null) {
            throw new IllegalArgumentException("state must not be null");
        }
        if (createdAt == null) {
            throw new IllegalArgumentException("createdAt must not be null");
        }

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

    public void transitionTo(ModelArtifactState newState) {
        this.state = newState;
    }
}
