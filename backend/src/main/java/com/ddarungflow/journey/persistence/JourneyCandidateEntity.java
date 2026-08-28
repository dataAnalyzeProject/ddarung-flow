package com.ddarungflow.journey.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "journey_candidates", uniqueConstraints = @UniqueConstraint(name = "uk_journey_candidate_key", columnNames = {"decision_id", "candidate_key"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JourneyCandidateEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "decision_id", nullable = false)
    private JourneyDecisionEntity decision;

    @Column(name = "candidate_key", nullable = false, length = 100)
    private String candidateKey;

    @Column(nullable = false, length = 40)
    private String archetype;

    @Column(name = "snapshot_json", nullable = false, columnDefinition = "text")
    private String snapshotJson;

    @Column(name = "provenance_json", nullable = false, columnDefinition = "text")
    private String provenanceJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    JourneyCandidateEntity(String candidateKey, String archetype, String snapshotJson, String provenanceJson) {
        this.candidateKey = candidateKey;
        this.archetype = archetype;
        this.snapshotJson = snapshotJson;
        this.provenanceJson = provenanceJson;
    }

    void attachTo(JourneyDecisionEntity decision) {
        this.decision = decision;
    }

    @jakarta.persistence.PrePersist
    void createTimestamp() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
