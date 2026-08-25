package com.ddarungflow.modelops.retention;

import com.ddarungflow.modelops.ModelArtifactState;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "model_artifact_purge_marks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PurgeMark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "artifact_id", nullable = false, unique = true)
    private Long artifactId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ModelArtifactState state;

    @Column(name = "marked_at", nullable = false)
    private OffsetDateTime markedAt;

    @Column(length = 256)
    private String reason;

    @Builder
    public PurgeMark(Long id, Long artifactId, ModelArtifactState state, OffsetDateTime markedAt, String reason) {
        if (artifactId == null) {
            throw new IllegalArgumentException("artifactId는 필수입니다.");
        }
        if (state == null) {
            throw new IllegalArgumentException("state는 필수입니다.");
        }
        this.id = id;
        this.artifactId = artifactId;
        this.state = state;
        this.markedAt = markedAt != null ? markedAt : OffsetDateTime.now();
        this.reason = reason;
    }
}
