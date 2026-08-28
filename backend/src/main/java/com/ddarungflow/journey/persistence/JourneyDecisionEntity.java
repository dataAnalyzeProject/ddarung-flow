package com.ddarungflow.journey.persistence;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "journey_decisions", uniqueConstraints = @UniqueConstraint(name = "uk_journey_decisions_public_id", columnNames = "public_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JourneyDecisionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false, length = 36)
    private String publicId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private int revision;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(name = "normalized_intent_json", nullable = false, columnDefinition = "text")
    private String normalizedIntentJson;

    @Column(name = "contract_versions", nullable = false, columnDefinition = "text")
    private String contractVersions;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @OneToMany(mappedBy = "decision", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private final List<JourneyCandidateEntity> candidates = new ArrayList<>();

    JourneyDecisionEntity(String publicId, Long userId, int revision, String status, String normalizedIntentJson,
                          String contractVersions, OffsetDateTime generatedAt, OffsetDateTime expiresAt) {
        this.publicId = publicId;
        this.userId = userId;
        this.revision = revision;
        this.status = status;
        this.normalizedIntentJson = normalizedIntentJson;
        this.contractVersions = contractVersions;
        this.generatedAt = generatedAt;
        this.expiresAt = expiresAt;
    }

    void addCandidate(JourneyCandidateEntity candidate) {
        candidate.attachTo(this);
        candidates.add(candidate);
    }

    @PrePersist
    void createTimestamps() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @jakarta.persistence.PreUpdate
    void updateTimestamp() {
        updatedAt = OffsetDateTime.now();
    }
}
