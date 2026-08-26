package com.ddarungflow.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;

@Entity
@Table(name = "model_performance_runs", uniqueConstraints = @UniqueConstraint(name = "uk_model_performance_runs_sha_generated", columnNames = {"artifact_sha256", "generated_at"}))
public class ModelPerformanceRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "artifact_sha256", nullable = false, length = 64) private String artifactSha256;
    @Column(name = "model_version", nullable = false, length = 200) private String modelVersion;
    @Column(name = "generated_at", nullable = false) private OffsetDateTime generatedAt;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") private JsonNode payload;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    protected ModelPerformanceRun() { }
    public ModelPerformanceRun(String artifactSha256, String modelVersion, OffsetDateTime generatedAt, JsonNode payload) {
        if (artifactSha256 == null || !artifactSha256.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("artifactSha256 must be lowercase SHA-256");
        this.artifactSha256 = artifactSha256; this.modelVersion = modelVersion; this.generatedAt = generatedAt; this.payload = payload; this.createdAt = OffsetDateTime.now();
    }
    public String getArtifactSha256() { return artifactSha256; } public String getModelVersion() { return modelVersion; }
    public OffsetDateTime getGeneratedAt() { return generatedAt; } public JsonNode getPayload() { return payload; }
}
