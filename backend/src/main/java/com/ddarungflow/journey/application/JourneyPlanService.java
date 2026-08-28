package com.ddarungflow.journey.application;

import com.ddarungflow.journey.domain.JourneyArchetype;
import com.ddarungflow.journey.domain.JourneyCandidate;
import com.ddarungflow.journey.domain.JourneyStatus;
import com.ddarungflow.journey.domain.ParetoJourneyRanker;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JourneyPlanService {
    private final Map<String, Decision> decisions = new ConcurrentHashMap<>();
    private final ParetoJourneyRanker ranker = new ParetoJourneyRanker();
    private final boolean fixtureEnabled;

    public JourneyPlanService(@Value("${journey.phase-a-fixture-enabled:false}") boolean fixtureEnabled) {
        this.fixtureEnabled = fixtureEnabled;
    }

    public Decision plan(PlanInput input) {
        if (input.requiredBikeCount() < 1 || input.requiredBikeCount() > 5 || input.originName().isBlank()) {
            throw new InvalidJourneyInput();
        }
        String id = UUID.randomUUID().toString();
        if (!fixtureEnabled) {
            Decision unavailable = new Decision(id, 1, JourneyStatus.UNAVAILABLE, input.originName(), input.destinationName(),
                    List.of(), List.of("Journey Phase A provider integration is disabled."), OffsetDateTime.now().plusMinutes(20));
            decisions.put(id, unavailable);
            return unavailable;
        }
        Decision decision = new Decision(id, 1, JourneyStatus.PARTIAL, input.originName(),
                input.destinationName() == null || input.destinationName().isBlank() ? "주변 추천 목적지" : input.destinationName(),
                ranker.rank(fixtureCandidates(input)), List.of("Phase A fixture only: return provider is disabled."),
                OffsetDateTime.now().plusMinutes(20));
        decisions.put(id, decision);
        return decision;
    }

    public Decision find(String id) {
        Decision decision = decisions.get(id);
        if (decision == null) throw new DecisionMissing();
        if (decision.expiresAt().isBefore(OffsetDateTime.now())) return decision.withStatus(JourneyStatus.EXPIRED);
        return decision;
    }

    public Decision replan(String id, PlanInput input) {
        Decision current = find(id);
        Decision next = plan(input);
        return new Decision(next.decisionId(), current.revision() + 1, next.status(), next.originName(), next.destinationName(), next.candidates(), next.warnings(), next.expiresAt());
    }

    public Counterfactual counterfactual(String id) {
        find(id);
        return new Counterfactual("출발 시각을 20분 늦추면 쾌적형 후보가 1위가 됩니다.", "departureAt", "+20 minutes");
    }

    private List<JourneyCandidate> fixtureCandidates(PlanInput input) {
        String destination = input.destinationName() == null || input.destinationName().isBlank() ? "서울숲" : input.destinationName();
        return List.of(
                new JourneyCandidate("stable", JourneyArchetype.STABLE, 0, 84, 78, 31, 4600, 38, 74, destination, "목적지", "대여·반납 후보가 안정적입니다.", "혼잡 시간에는 우회가 필요할 수 있습니다."),
                new JourneyCandidate("comfortable", JourneyArchetype.COMFORTABLE, 0, 76, 71, 36, 5100, 18, 91, destination, "목적지", "경사와 차도를 줄인 경로입니다.", "이동 시간이 조금 더 깁니다."),
                new JourneyCandidate("explorer", JourneyArchetype.EXPLORER, 0, 70, 69, 42, 6200, 52, 68, destination, "목적지", "방문 후보를 포함한 탐방 경로입니다.", "대여·반납 여유가 상대적으로 작습니다."));
    }

    public record PlanInput(String originName, String destinationName, int requiredBikeCount, Integer maxJourneyMinutes) { }
    public record Decision(String decisionId, int revision, JourneyStatus status, String originName, String destinationName,
                           List<JourneyCandidate> candidates, List<String> warnings, OffsetDateTime expiresAt) {
        Decision withStatus(JourneyStatus nextStatus) { return new Decision(decisionId, revision, nextStatus, originName, destinationName, candidates, warnings, expiresAt); }
    }
    public record Counterfactual(String summary, String changedField, String requiredChange) { }
    public static class InvalidJourneyInput extends RuntimeException { }
    public static class DecisionMissing extends RuntimeException { }
}
