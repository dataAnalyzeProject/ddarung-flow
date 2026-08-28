package com.ddarungflow.journey.persistence;

import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.saved.SavedJourneyEntity;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(JpaJourneyDecisionPersistenceAdapter.class)
@ActiveProfiles("test")
class JourneyDecisionPersistenceAdapterTest {

    @Autowired private JourneyDecisionPersistencePort port;
    @Autowired private JourneyDecisionRepository decisions;
    @Autowired private JourneyCandidateRepository candidates;
    @Autowired private UsersRepository users;

    private Long userId;

    @BeforeEach
    void setUp() {
        candidates.deleteAll();
        decisions.deleteAll();
        users.deleteAll();
        userId = users.save(Users.builder().provider("google").providerUserId("journey-persistence").displayName("Journey").build()).getId();
    }

    @Test
    void storesDecisionAndCandidatesAndFindsAnActiveDecision() {
        OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
        port.save(decision("decision-1", now.plusHours(24)));

        assertThat(port.findActiveDecision("decision-1", userId, now)).hasValueSatisfying(stored -> {
            assertThat(stored.status()).isEqualTo("PARTIAL");
            assertThat(stored.candidates()).extracting(JourneyDecisionPersistencePort.StoredCandidate::candidateKey)
                    .containsExactly("stable", "comfortable");
        });
        assertThat(candidates.count()).isEqualTo(2);
    }

    @Test
    void treats24HourTtlAsExpiredAndCleansUpParentAndCandidates() {
        OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
        port.save(decision("expired-decision", now));

        assertThat(port.isExpired("expired-decision", userId, now)).isTrue();
        assertThat(port.findActiveDecision("expired-decision", userId, now)).isEmpty();
        assertThat(port.deleteExpiredDecisions(now)).isEqualTo(1);
        assertThat(decisions.count()).isZero();
        assertThat(candidates.count()).isZero();
    }

    @Test
    void persistenceModelsDoNotContainRawNaturalLanguageFields() {
        assertThat(java.util.stream.Stream.concat(
                        Arrays.stream(JourneyDecisionEntity.class.getDeclaredFields()),
                        Arrays.stream(SavedJourneyEntity.class.getDeclaredFields()))
                .map(field -> field.getName().toLowerCase()))
                .noneMatch(name -> name.contains("naturallanguage") || name.contains("transcript") || name.contains("voice"));
    }

    private JourneyDecisionPersistencePort.DecisionToStore decision(String id, OffsetDateTime expiresAt) {
        OffsetDateTime generatedAt = expiresAt.minusHours(24);
        return new JourneyDecisionPersistencePort.DecisionToStore(id, userId, 1, "PARTIAL", "{\"origin\":\"place-1\"}",
                "journey-api-03", generatedAt, expiresAt, List.of(
                new JourneyDecisionPersistencePort.CandidateToStore("stable", "STABLE", "{\"rank\":1}", "{\"asOf\":\"test\"}"),
                new JourneyDecisionPersistencePort.CandidateToStore("comfortable", "COMFORTABLE", "{\"rank\":2}", "{\"asOf\":\"test\"}")));
    }
}
