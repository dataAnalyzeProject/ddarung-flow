package com.ddarungflow.journey.application;

import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.EvidenceSelectionValidator;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.ai.JourneyAiFailureStage;
import com.ddarungflow.journey.ai.JourneyAiGateway;
import com.ddarungflow.journey.ai.JourneyCompileRequest;
import com.ddarungflow.journey.ai.JourneyIntent;
import com.ddarungflow.journey.ai.PlaceReference;
import com.ddarungflow.journey.domain.JourneyArchetype;
import com.ddarungflow.journey.domain.JourneyCandidate;
import com.ddarungflow.journey.domain.JourneyStatus;
import com.ddarungflow.journey.domain.UnifiedJourneyPlan;
import com.ddarungflow.journey.persistence.JourneyDecisionPersistencePort;
import com.ddarungflow.journey.returnprediction.ReturnPredictionPort;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;

@Service
public class JourneyPlanService {
    private static final String CONTRACT_VERSIONS = "{\"api\":\"journey-api-r2.2\",\"ai\":\"consumer-ai-r2.2\",\"return\":\"disabled-user-facing\"}";
    private static final Set<String> THEMES = Set.of("PARK", "RIVER", "CAFE", "ATTRACTION", "CULTURE", "FOOD");
    private static final Set<String> ROUTE_MODES = Set.of("BIKE_ONLY", "ACCESSIBLE", "SHORTEST");
    private static final EvidenceSelectionValidator.StayMinutesBounds STAY_BOUNDS =
            new EvidenceSelectionValidator.StayMinutesBounds(10, 120);

    private final JourneyDecisionPersistencePort persistence;
    private final JourneyAiGateway aiGateway;
    @SuppressWarnings("unused")
    private final ReturnPredictionPort returnPredictionPort;
    private final JourneyRentalPredictionPort rentalPredictionPort;
    private final JourneyEvidencePort evidencePort;
    private final ObjectMapper objectMapper;
    private final EvidenceSelectionValidator selectionValidator = new EvidenceSelectionValidator();

    @Autowired
    public JourneyPlanService(
            JourneyDecisionPersistencePort persistence,
            JourneyAiGateway aiGateway,
            ReturnPredictionPort returnPredictionPort,
            JourneyRentalPredictionPort rentalPredictionPort,
            JourneyEvidencePort evidencePort,
            ObjectMapper objectMapper
    ) {
        this.persistence = persistence;
        this.aiGateway = aiGateway;
        this.returnPredictionPort = returnPredictionPort;
        this.rentalPredictionPort = rentalPredictionPort;
        this.evidencePort = evidencePort;
        this.objectMapper = objectMapper;
    }

    JourneyPlanService(JourneyDecisionPersistencePort persistence, JourneyAiGateway aiGateway,
                       ReturnPredictionPort returnPredictionPort, JourneyRentalPredictionPort rentalPredictionPort,
                       ObjectMapper objectMapper) {
        this(persistence, aiGateway, returnPredictionPort, rentalPredictionPort,
                JourneyEvidencePort.unavailable(), objectMapper);
    }

    Decision plan(long userId, PlanInput input) {
        return plan(userId, input, () -> { });
    }

    public Decision plan(long userId, PlanInput input, Runnable requireAiEntitlement) {
        validate(input, false);
        return persist(userId, UUID.randomUUID().toString(), 1, input,
                new PlannerContext(input.requestMode() == RequestMode.NATURAL_LANGUAGE, null), requireAiEntitlement);
    }

    public Decision planSavedReplay(long userId, PlanInput input) {
        validate(input, false);
        JourneyIntent structuredIntent = new JourneyIntent(toPlaceReference(input.origin()),
                toPlaceReference(input.destination()), input.departureAt(), input.maxJourneyMinutes(),
                input.requiredBikeCount(), Map.of(), Map.of(), List.of(), false);
        return persist(userId, UUID.randomUUID().toString(), 1, input,
                new PlannerContext(true, structuredIntent), () -> { });
    }

    public Decision find(long userId, String decisionId) {
        OffsetDateTime now = OffsetDateTime.now();
        return persistence.findActiveDecision(decisionId, userId, now)
                .map(this::toDecision)
                .orElseGet(() -> {
                    if (persistence.isExpired(decisionId, userId, now)) throw new DecisionExpired();
                    throw new DecisionMissing();
                });
    }

    Decision replan(long userId, String decisionId, PlanInput input) {
        return replan(userId, decisionId, input, () -> { });
    }

    public Decision replan(long userId, String decisionId, PlanInput input, Runnable requireAiEntitlement) {
        validate(input, true);
        Decision current = find(userId, decisionId);
        if (!current.revision().equals(input.expectedRevision())) throw new RevisionConflict();
        JourneyIntent previousIntent = readAiIntent(current.normalizedIntent().path("aiIntent"));
        boolean aiSchedule = previousIntent != null && RequestMode.NATURAL_LANGUAGE.name().equals(
                current.normalizedIntent().path("plannerMode").asText(current.normalizedIntent().path("requestMode").asText()));
        return persist(userId, decisionId, current.revision() + 1, input,
                new PlannerContext(aiSchedule, previousIntent), requireAiEntitlement);
    }

    public Counterfactual counterfactual(long userId, String decisionId) {
        find(userId, decisionId);
        throw new NoValidCandidate();
    }

    private Decision persist(
            long userId,
            String decisionId,
            int revision,
            PlanInput input,
            PlannerContext planner,
            Runnable requireAiEntitlement
    ) {
        JourneyIntent aiIntent = planner.aiIntent();
        List<String> warnings = new ArrayList<>();

        if (input.destination() == null) {
            return save(userId, decisionId, revision, input, planner.useAiSchedule(), aiIntent,
                    JourneyStatus.CLARIFICATION_REQUIRED, List.of(), null, List.of("CLARIFICATION_REQUIRED"));
        }

        if (input.requestMode() == RequestMode.NATURAL_LANGUAGE) {
            requireAiEntitlement.run();
            try {
                JourneyAiGateway.IntentResult result = aiGateway.compileIntent(compileRequest(input));
                if (result.available()) {
                    aiIntent = result.intent();
                    validateCompiledIntent(input, aiIntent);
                    if (aiIntent.needsClarification()) {
                        return save(userId, decisionId, revision, input, true, aiIntent,
                                JourneyStatus.CLARIFICATION_REQUIRED, List.of(), null,
                                List.of("CLARIFICATION_REQUIRED"));
                    }
                } else {
                    warnings.add(safeAiCode(result.unavailableCode()));
                }
            } catch (JourneyAiException exception) {
                handleAiFailure(exception, warnings);
            }
        }

        List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates;
        boolean rentalProviderError = false;
        try {
            coreCandidates = rentalPredictionPort.predict(new JourneyRentalPredictionPort.RentalPredictionRequest(
                    BigDecimal.valueOf(input.origin().latitude()), BigDecimal.valueOf(input.origin().longitude()),
                    BigDecimal.valueOf(input.destination().latitude()), BigDecimal.valueOf(input.destination().longitude()),
                    input.departureAt(), input.requiredBikeCount()));
        } catch (Exception exception) {
            coreCandidates = List.of();
            rentalProviderError = true;
        }

        int normalCandidateCount = (int) coreCandidates.stream()
                .filter(candidate -> "NORMAL".equals(candidate.predictionStatus()))
                .count();
        List<JourneyCandidate> candidates = toJourneyCandidates(coreCandidates, input);
        JourneyStatus rentalStatus = candidates.isEmpty() ? JourneyStatus.UNAVAILABLE
                : normalCandidateCount == coreCandidates.size() ? JourneyStatus.READY : JourneyStatus.PARTIAL;
        if (rentalProviderError) addWarning(warnings, "JOURNEY_RENTAL_PROVIDER_ERROR");
        else if (coreCandidates.isEmpty()) addWarning(warnings, "JOURNEY_RENTAL_EMPTY");
        else if (rentalStatus == JourneyStatus.UNAVAILABLE) addWarning(warnings, "JOURNEY_RENTAL_UNAVAILABLE");
        if (rentalStatus == JourneyStatus.PARTIAL) addWarning(warnings, "JOURNEY_RENTAL_PARTIAL");

        UnifiedJourneyPlan unifiedPlan = null;
        if (evidencePort.available() && !candidates.isEmpty()) {
            if (planner.useAiSchedule() && aiIntent == null) {
                JourneyCandidate selected = candidates.getFirst();
                JourneyRentalPredictionPort.RentalCandidate selectedCore = findCoreCandidate(coreCandidates, selected);
                unifiedPlan = unavailableAiPlan(input, selected, selectedCore, warnings);
            } else {
                unifiedPlan = buildUnifiedPlan(input, aiIntent, planner.useAiSchedule(), candidates, coreCandidates,
                        warnings, requireAiEntitlement);
            }
        }

        JourneyStatus status = unifiedPlan == null ? rentalStatus : switch (unifiedPlan.status()) {
            case READY -> JourneyStatus.READY;
            case PARTIAL -> JourneyStatus.PARTIAL;
            case UNAVAILABLE -> JourneyStatus.UNAVAILABLE;
        };
        return save(userId, decisionId, revision, input, planner.useAiSchedule(), aiIntent,
                status, candidates, unifiedPlan, warnings);
    }

    private UnifiedJourneyPlan buildUnifiedPlan(
            PlanInput input,
            JourneyIntent aiIntent,
            boolean useAiSchedule,
            List<JourneyCandidate> candidates,
            List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates,
            List<String> warnings,
            Runnable requireAiEntitlement
    ) {
        ResolvedConstraints constraints = resolveConstraints(input, aiIntent);
        Map<String, ConsumerAiEvidenceBundle.Evidence> rental = new LinkedHashMap<>();
        Map<String, ConsumerAiEvidenceBundle.Evidence> pois = new LinkedHashMap<>();
        Map<String, ConsumerAiEvidenceBundle.Evidence> routes = new LinkedHashMap<>();
        Map<String, ConsumerAiEvidenceBundle.Evidence> weather = new LinkedHashMap<>();
        Map<String, ConsumerAiEvidenceBundle.Evidence> airQuality = new LinkedHashMap<>();
        Map<String, JourneyEvidencePort.PoiEvidence> poiData = new LinkedHashMap<>();
        Map<String, RouteLink> routeData = new LinkedHashMap<>();
        Map<String, List<String>> candidateWarnings = new LinkedHashMap<>();

        for (JourneyCandidate candidate : candidates) {
            String candidateId = rentalId(candidate.stationId());
            rental.put(candidateId, rentalEvidence(candidate));
            List<String> localWarnings = new ArrayList<>();
            candidateWarnings.put(candidateId, localWarnings);
            JourneyRentalPredictionPort.RentalCandidate coreCandidate = findCoreCandidate(coreCandidates, candidate);
            JourneyRentalPredictionPort.RouteEvidence accessRoute = coreCandidate == null ? null : coreCandidate.accessRoute();
            if (accessRoute == null || !"NORMAL".equals(coreCandidate.routeStatus())) {
                addWarning(localWarnings, "ACCESS_ROUTE_UNAVAILABLE");
                routes.put(accessRouteId(candidate.stationId()), unavailableAccessRouteEvidence(candidate));
                continue;
            }
            routes.put(accessRouteId(candidate.stationId()), accessRouteEvidence(candidate, accessRoute));
            Map<String, JourneyEvidencePort.PoiEvidence> candidatePoiData = new LinkedHashMap<>();
            collectPois(candidate, constraints, pois, candidatePoiData, localWarnings);
            poiData.putAll(candidatePoiData);
            collectRoutes(candidate, constraints.routeMode(), candidatePoiData, routes, routeData, localWarnings);
            collectEnvironment(candidate, weather, airQuality, localWarnings);
        }
        ConsumerAiEvidenceBundle bundle = new ConsumerAiEvidenceBundle(rental, pois, routes, weather, airQuality);

        EvidenceSelectionValidator.Selection selection;
        if (useAiSchedule) {
            requireAiEntitlement.run();
            JourneyAiGateway.ScheduleResult result;
            try {
                result = aiGateway.selectSchedule(bundle, new JourneyAiGateway.ScheduleConstraints(
                        constraints.stopCount(), STAY_BOUNDS.minimum(), STAY_BOUNDS.maximum(), constraints.availableMinutes()));
            } catch (JourneyAiException exception) {
                handleAiFailure(exception, warnings);
                JourneyCandidate fallback = candidates.getFirst();
                appendWarnings(warnings, candidateWarnings.get(rentalId(fallback.stationId())));
                return unavailableWithFactualSegments(input, fallback, findCoreCandidate(coreCandidates, fallback), bundle, warnings,
                        safeAiCode(exception.code()));
            }
            if (result == null || !result.available()) {
                String code = safeAiCode(result == null ? JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE : result.unavailableCode());
                addWarning(warnings, code);
                JourneyCandidate fallback = candidates.getFirst();
                appendWarnings(warnings, candidateWarnings.get(rentalId(fallback.stationId())));
                return unavailableWithFactualSegments(input, fallback, findCoreCandidate(coreCandidates, fallback), bundle, warnings, code);
            }
            selection = result.selection();
        } else {
            JourneyCandidate fallback = candidates.getFirst();
            selection = deterministicSelection(rentalId(fallback.stationId()), constraints, fallback,
                    pois, routeData, weather, airQuality);
        }

        JourneyCandidate selected = candidates.stream()
                .filter(candidate -> rentalId(candidate.stationId()).equals(selection.rentalCandidateId()))
                .findFirst().orElse(null);
        JourneyRentalPredictionPort.RentalCandidate selectedCore = findCoreCandidate(coreCandidates, selected);
        if (selected == null || selectedCore == null || selectedCore.accessRoute() == null
                || !"NORMAL".equals(selectedCore.routeStatus())) {
            if (useAiSchedule) throw new AiToolValueMismatch();
            addWarning(warnings, "ACCESS_ROUTE_UNAVAILABLE");
            return new UnifiedJourneyPlan(UnifiedJourneyPlan.Status.UNAVAILABLE, selection.rentalCandidateId(),
                    bundle, List.of(), null, List.of(), List.copyOf(warnings));
        }
        appendWarnings(warnings, candidateWarnings.get(selection.rentalCandidateId()));

        EvidenceSelectionValidator.ValidatedSelection validated;
        try {
            validated = selectionValidator.validate(bundle, selection, STAY_BOUNDS);
            validateSelection(selection, validated, constraints, selected, poiData, routeData);
        } catch (JourneyAiException exception) {
            throw new AiToolValueMismatch();
        } catch (RuntimeException exception) {
            if (useAiSchedule) throw new AiToolValueMismatch();
            addWarning(warnings, "JOURNEY_ROUTE_CHAIN_UNAVAILABLE");
            return unavailableWithFactualSegments(input, selected, selectedCore, bundle, warnings,
                    "JOURNEY_ROUTE_CHAIN_UNAVAILABLE");
        }

        List<UnifiedJourneyPlan.Segment> segments = buildTimeline(input, selected, selectedCore, selection, routeData);
        long elapsedSeconds = Duration.between(input.departureAt(), segments.getLast().endAt()).getSeconds();
        if (elapsedSeconds > constraints.availableMinutes() * 60L) {
            if (useAiSchedule) throw new AiToolValueMismatch();
            addWarning(warnings, "JOURNEY_DURATION_EXCEEDED");
            return unavailableWithFactualSegments(input, selected, selectedCore, bundle, warnings,
                    "JOURNEY_DURATION_EXCEEDED");
        }
        if (selection.stops().size() < constraints.stopCount()) addWarning(warnings, "VISIT_PARTIAL");
        UnifiedJourneyPlan.Status status = warnings.isEmpty() && selection.stops().size() == constraints.stopCount()
                ? UnifiedJourneyPlan.Status.READY : UnifiedJourneyPlan.Status.PARTIAL;
        return new UnifiedJourneyPlan(status, selection.rentalCandidateId(), bundle, segments,
                validated.rationale(), validated.rationaleTags(), List.copyOf(warnings));
    }

    private UnifiedJourneyPlan unavailableAiPlan(
            PlanInput input,
            JourneyCandidate selected,
            JourneyRentalPredictionPort.RentalCandidate selectedCore,
            List<String> warnings
    ) {
        Map<String, ConsumerAiEvidenceBundle.Evidence> rental = Map.of(rentalId(selected.stationId()), rentalEvidence(selected));
        Map<String, ConsumerAiEvidenceBundle.Evidence> routes = new LinkedHashMap<>();
        if (selectedCore != null && selectedCore.accessRoute() != null && "NORMAL".equals(selectedCore.routeStatus())) {
            routes.put(accessRouteId(selected.stationId()), accessRouteEvidence(selected, selectedCore.accessRoute()));
        } else {
            addWarning(warnings, "ACCESS_ROUTE_UNAVAILABLE");
            routes.put(accessRouteId(selected.stationId()), unavailableAccessRouteEvidence(selected));
        }
        addWarning(warnings, "AI_SCHEDULE_UNAVAILABLE");
        List<UnifiedJourneyPlan.Segment> segments = selectedCore != null && selectedCore.accessRoute() != null
                && "NORMAL".equals(selectedCore.routeStatus())
                ? accessAndRentSegments(input, selected, selectedCore) : List.of();
        return new UnifiedJourneyPlan(UnifiedJourneyPlan.Status.UNAVAILABLE, rentalId(selected.stationId()),
                new ConsumerAiEvidenceBundle(rental, Map.of(), routes, Map.of(), Map.of()), segments, null,
                List.of(), List.copyOf(warnings));
    }

    private UnifiedJourneyPlan unavailableWithFactualSegments(
            PlanInput input,
            JourneyCandidate selected,
            JourneyRentalPredictionPort.RentalCandidate selectedCore,
            ConsumerAiEvidenceBundle bundle,
            List<String> warnings,
            String code
    ) {
        addWarning(warnings, code);
        List<UnifiedJourneyPlan.Segment> segments = selectedCore == null || selectedCore.accessRoute() == null
                ? List.of() : accessAndRentSegments(input, selected, selectedCore);
        return new UnifiedJourneyPlan(UnifiedJourneyPlan.Status.UNAVAILABLE, rentalId(selected.stationId()),
                bundle, segments, null, List.of(), List.copyOf(warnings));
    }

    private void collectPois(
            JourneyCandidate selected,
            ResolvedConstraints constraints,
            Map<String, ConsumerAiEvidenceBundle.Evidence> evidence,
            Map<String, JourneyEvidencePort.PoiEvidence> data,
            List<String> warnings
    ) {
        if (constraints.themes().isEmpty()) {
            addWarning(warnings, "POI_THEME_MISSING");
            return;
        }
        for (String theme : constraints.themes()) {
            List<JourneyEvidencePort.PoiEvidence> places;
            try {
                places = evidencePort.findNearby(selected.stationId(), theme, constraints.stopCount());
            } catch (RuntimeException exception) {
                addWarning(warnings, "POI_PROVIDER_UNAVAILABLE:" + theme);
                continue;
            }
            if (places.isEmpty()) addWarning(warnings, "POI_EMPTY:" + theme);
            for (JourneyEvidencePort.PoiEvidence place : places) {
                String id = poiId(selected.stationId(), place.placeId());
                if (data.containsKey(id)) continue;
                data.put(id, place);
                evidence.put(id, new ConsumerAiEvidenceBundle.Evidence(
                        id, "kakao-local", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL, null,
                        textFacts("rentalCandidateId", rentalId(selected.stationId()), "stationId", selected.stationId(),
                                "placeId", place.placeId(), "name", place.name(), "address", place.address(),
                                "category", place.category(), "theme", theme),
                        numericFacts("latitude", place.latitude(), "longitude", place.longitude(),
                                "distanceMeters", decimal(place.distanceMeters()))));
                if (data.size() >= constraints.stopCount()) return;
            }
        }
    }

    private void collectRoutes(
            JourneyCandidate selected,
            String routeMode,
            Map<String, JourneyEvidencePort.PoiEvidence> pois,
            Map<String, ConsumerAiEvidenceBundle.Evidence> evidence,
            Map<String, RouteLink> data,
            List<String> warnings
    ) {
        List<String> poiIds = new ArrayList<>(pois.keySet());
        for (String toPoiId : poiIds) {
            addRoute(selected, rentalId(selected.stationId()), selected.latitude(), selected.longitude(),
                    toPoiId, pois.get(toPoiId), routeMode, evidence, data, warnings);
        }
        for (String fromPoiId : poiIds) {
            JourneyEvidencePort.PoiEvidence from = pois.get(fromPoiId);
            for (String toPoiId : poiIds) {
                if (fromPoiId.equals(toPoiId)) continue;
                addRoute(selected, fromPoiId, from.latitude(), from.longitude(), toPoiId, pois.get(toPoiId),
                        routeMode, evidence, data, warnings);
            }
        }
    }

    private void addRoute(
            JourneyCandidate selected,
            String fromId,
            BigDecimal fromLatitude,
            BigDecimal fromLongitude,
            String toId,
            JourneyEvidencePort.PoiEvidence to,
            String routeMode,
            Map<String, ConsumerAiEvidenceBundle.Evidence> evidence,
            Map<String, RouteLink> data,
            List<String> warnings
    ) {
        String routeId = routeId(fromId, toId);
        String providerWarning = "BICYCLE_ROUTE_EMPTY:" + routeId;
        try {
            Optional<JourneyEvidencePort.RouteEvidence> route = evidencePort.bicycleRoute(
                    fromLatitude, fromLongitude, to.latitude(), to.longitude(), routeMode);
            if (route.isPresent()) {
                JourneyEvidencePort.RouteEvidence actual = route.get();
                data.put(routeId, new RouteLink(fromId, toId, actual));
                evidence.put(routeId, new ConsumerAiEvidenceBundle.Evidence(
                        routeId, "kakao-bicycle", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL, null,
                        textFacts("rentalCandidateId", rentalId(selected.stationId()), "fromEvidenceId", fromId,
                                "toEvidenceId", toId, "travelMode", actual.travelMode(), "routeMode", actual.routeMode()),
                        numericFacts("distanceMeters", decimal(actual.distanceMeters()),
                                "durationSeconds", decimal(actual.durationSeconds()))));
                return;
            }
        } catch (RuntimeException exception) {
            providerWarning = "BICYCLE_ROUTE_PROVIDER_ERROR:" + routeId;
        }
        evidence.put(routeId, new ConsumerAiEvidenceBundle.Evidence(
                routeId, "kakao-bicycle", ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE, null,
                textFacts("rentalCandidateId", rentalId(selected.stationId()), "fromEvidenceId", fromId,
                        "toEvidenceId", toId, "routeMode", routeMode), Map.of()));
        addWarning(warnings, "BICYCLE_ROUTE_UNAVAILABLE:" + routeId);
        addWarning(warnings, providerWarning);
    }

    private void collectEnvironment(
            JourneyCandidate selected,
            Map<String, ConsumerAiEvidenceBundle.Evidence> weather,
            Map<String, ConsumerAiEvidenceBundle.Evidence> airQuality,
            List<String> warnings
    ) {
        String weatherId = "weather:" + selected.stationId();
        try {
            JourneyEvidencePort.EnvironmentEvidence result = evidencePort.weather(
                    selected.latitude(), selected.longitude(), selected.arrivalAt());
            weather.put(weatherId, environmentEvidence(weatherId, selected, result));
            if (!"NORMAL".equals(result.status())) addWarning(warnings, "WEATHER_" + status(result.status()).name());
        } catch (RuntimeException exception) {
            weather.put(weatherId, unavailableEnvironment(weatherId, "kma-short-forecast", selected));
            addWarning(warnings, "WEATHER_UNAVAILABLE");
        }

        String airId = "air-quality:" + selected.stationId();
        try {
            JourneyEvidencePort.EnvironmentEvidence result = evidencePort.airQuality(selected.stationId());
            airQuality.put(airId, environmentEvidence(airId, selected, result));
            if (!"NORMAL".equals(result.status())) addWarning(warnings, "AIR_QUALITY_" + status(result.status()).name());
        } catch (RuntimeException exception) {
            airQuality.put(airId, unavailableEnvironment(airId, "air-korea", selected));
            addWarning(warnings, "AIR_QUALITY_UNAVAILABLE");
        }
    }

    private EvidenceSelectionValidator.Selection deterministicSelection(
            String rentalId,
            ResolvedConstraints constraints,
            JourneyCandidate selected,
            Map<String, ConsumerAiEvidenceBundle.Evidence> pois,
            Map<String, RouteLink> routes,
            Map<String, ConsumerAiEvidenceBundle.Evidence> weather,
            Map<String, ConsumerAiEvidenceBundle.Evidence> airQuality
    ) {
        List<EvidenceSelectionValidator.StopSelection> stops = new ArrayList<>();
        List<String> routeIds = new ArrayList<>();
        String current = rentalId;
        int elapsedSeconds = selected.accessDurationSeconds() == null ? 0 : selected.accessDurationSeconds();
        for (String poiId : pois.keySet()) {
            if (stops.size() >= constraints.stopCount()) break;
            String routeId = routeId(current, poiId);
            RouteLink route = routes.get(routeId);
            if (route == null) continue;
            int remainingSeconds = constraints.availableMinutes() * 60 - elapsedSeconds - route.route().durationSeconds();
            int stayMinutes = Math.min(30, remainingSeconds / 60);
            if (stayMinutes < STAY_BOUNDS.minimum()) continue;
            stops.add(new EvidenceSelectionValidator.StopSelection(poiId, stayMinutes));
            routeIds.add(routeId);
            elapsedSeconds += route.route().durationSeconds() + stayMinutes * 60;
            current = poiId;
        }
        return new EvidenceSelectionValidator.Selection(
                rentalId, stops, routeIds,
                weather.containsKey("weather:" + selected.stationId()) ? List.of("weather:" + selected.stationId()) : List.of(),
                airQuality.containsKey("air-quality:" + selected.stationId()) ? List.of("air-quality:" + selected.stationId()) : List.of(),
                List.of(), List.of(), "STRUCTURED_SERVER_SELECTION", List.of("STRUCTURED_CONSTRAINTS"));
    }

    private void validateSelection(
            EvidenceSelectionValidator.Selection selection,
            EvidenceSelectionValidator.ValidatedSelection validated,
            ResolvedConstraints constraints,
            JourneyCandidate selected,
            Map<String, JourneyEvidencePort.PoiEvidence> pois,
            Map<String, RouteLink> routes
    ) {
        String rentalId = rentalId(selected.stationId());
        if (!rentalId.equals(selection.rentalCandidateId()) || selection.stops().size() > constraints.stopCount()
                || selection.rationale() == null || selection.rationale().isBlank()
                || containsNumericToken(selection.rationale())
                || selection.weatherEvidenceIds().stream().anyMatch(id -> !("weather:" + selected.stationId()).equals(id))
                || selection.airQualityEvidenceIds().stream().anyMatch(id -> !("air-quality:" + selected.stationId()).equals(id))) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, "invalid schedule selection");
        }
        List<String> expectedRoutes = new ArrayList<>();
        String from = rentalId;
        for (EvidenceSelectionValidator.StopSelection stop : selection.stops()) {
            if (!pois.containsKey(stop.poiId())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, "unknown schedule POI");
            }
            String routeId = routeId(from, stop.poiId());
            RouteLink route = routes.get(routeId);
            if (route == null || !from.equals(route.fromEvidenceId()) || !stop.poiId().equals(route.toEvidenceId())) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, "invalid route chain");
            }
            expectedRoutes.add(routeId);
            from = stop.poiId();
        }
        if (!expectedRoutes.equals(selection.routeEvidenceIds())
                || validated.stops().size() != selection.stops().size()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH, "route selection mismatch");
        }
    }

    private List<UnifiedJourneyPlan.Segment> buildTimeline(
            PlanInput input,
            JourneyCandidate selected,
            JourneyRentalPredictionPort.RentalCandidate selectedCore,
            EvidenceSelectionValidator.Selection selection,
            Map<String, RouteLink> routes
    ) {
        List<UnifiedJourneyPlan.Segment> segments = new ArrayList<>(accessAndRentSegments(input, selected, selectedCore));
        OffsetDateTime current = selected.arrivalAt();
        String from = rentalId(selected.stationId());
        for (int index = 0; index < selection.stops().size(); index++) {
            EvidenceSelectionValidator.StopSelection stop = selection.stops().get(index);
            RouteLink route = routes.get(routeId(from, stop.poiId()));
            OffsetDateTime rideEnd = current.plusSeconds(route.route().durationSeconds());
            segments.add(new UnifiedJourneyPlan.Segment(
                    "RIDE_" + (index + 1), UnifiedJourneyPlan.SegmentType.RIDE, from, stop.poiId(), current, rideEnd,
                    route.route().durationSeconds(), route.route().distanceMeters(), route.route().travelMode(),
                    route.route().routeMode(), route.route().pathPoints().stream()
                    .map(point -> new UnifiedJourneyPlan.RoutePoint(point.latitude(), point.longitude())).toList(), null, null));
            OffsetDateTime visitEnd = rideEnd.plusMinutes(stop.stayMinutes());
            segments.add(new UnifiedJourneyPlan.Segment(
                    "VISIT_" + (index + 1), UnifiedJourneyPlan.SegmentType.VISIT, stop.poiId(), stop.poiId(),
                    rideEnd, visitEnd, stop.stayMinutes() * 60, null, null, null, List.of(), stop.stayMinutes(), null));
            current = visitEnd;
            from = stop.poiId();
        }
        return List.copyOf(segments);
    }

    private List<UnifiedJourneyPlan.Segment> accessAndRentSegments(
            PlanInput input,
            JourneyCandidate selected,
            JourneyRentalPredictionPort.RentalCandidate selectedCore
    ) {
        JourneyRentalPredictionPort.RouteEvidence route = selectedCore.accessRoute();
        OffsetDateTime calculatedArrival = input.departureAt().plusSeconds(route.durationSeconds());
        if (!calculatedArrival.isEqual(selected.arrivalAt())
                || !route.durationSeconds().equals(selected.accessDurationSeconds())
                || !route.distanceMeters().equals(selected.distanceMeters())) {
            throw new IllegalStateException("access route duration and arrival evidence disagree");
        }
        UnifiedJourneyPlan.Segment access = new UnifiedJourneyPlan.Segment(
                "ACCESS", UnifiedJourneyPlan.SegmentType.ACCESS, "place:" + input.origin().placeId(),
                rentalId(selected.stationId()), input.departureAt(), selected.arrivalAt(), route.durationSeconds(),
                route.distanceMeters(), route.travelMode(), null,
                route.pathPoints().stream().map(point -> new UnifiedJourneyPlan.RoutePoint(
                        point.latitude(), point.longitude())).toList(), null, null);
        UnifiedJourneyPlan.RentalFacts facts = new UnifiedJourneyPlan.RentalFacts(
                selected.stationId(), selected.stationName(), selected.rentalProbability(), selected.requiredBikeCount(),
                selected.availableBikeCount(), selected.inventoryStatus(), selected.inventoryCollectedAt(),
                selected.predictionStatus(), selected.predictionTargetAt(), selected.featureAsOf(), selected.modelVersion(),
                selected.generatedAt());
        UnifiedJourneyPlan.Segment rent = new UnifiedJourneyPlan.Segment(
                "RENT", UnifiedJourneyPlan.SegmentType.RENT, rentalId(selected.stationId()), rentalId(selected.stationId()),
                selected.arrivalAt(), selected.arrivalAt(), 0, null, null, null, List.of(), null, facts);
        return List.of(access, rent);
    }

    private ConsumerAiEvidenceBundle.Evidence rentalEvidence(JourneyCandidate candidate) {
        return new ConsumerAiEvidenceBundle.Evidence(
                rentalId(candidate.stationId()), "core-on-demand-prediction", status(candidate.predictionStatus()),
                candidate.generatedAt(),
                textFacts("stationId", candidate.stationId(), "stationName", candidate.stationName(),
                        "predictionStatus", candidate.predictionStatus(), "inventoryStatus", candidate.inventoryStatus(),
                        "availabilityLevel", candidate.availabilityLevel(), "modelVersion", candidate.modelVersion(),
                        "inventoryCollectedAt", string(candidate.inventoryCollectedAt()),
                        "arrivalAt", string(candidate.arrivalAt()), "predictionTargetAt", string(candidate.predictionTargetAt()),
                        "featureAsOf", string(candidate.featureAsOf()), "generatedAt", string(candidate.generatedAt())),
                numericFacts("rentalProbability", candidate.rentalProbability(),
                        "requiredBikeCount", decimal(candidate.requiredBikeCount()),
                        "availableBikeCount", decimal(candidate.availableBikeCount()),
                        "accessDistanceMeters", decimal(candidate.distanceMeters()),
                        "accessDurationSeconds", decimal(candidate.accessDurationSeconds())));
    }

    private ConsumerAiEvidenceBundle.Evidence accessRouteEvidence(
            JourneyCandidate candidate,
            JourneyRentalPredictionPort.RouteEvidence route
    ) {
        return new ConsumerAiEvidenceBundle.Evidence(
                accessRouteId(candidate.stationId()), "core-route-provider",
                ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL, candidate.generatedAt(),
                textFacts("rentalCandidateId", rentalId(candidate.stationId()), "travelMode", route.travelMode(),
                        "segmentType", "ACCESS"),
                numericFacts("distanceMeters", decimal(route.distanceMeters()),
                        "durationSeconds", decimal(route.durationSeconds())));
    }

    private ConsumerAiEvidenceBundle.Evidence unavailableAccessRouteEvidence(JourneyCandidate candidate) {
        return new ConsumerAiEvidenceBundle.Evidence(
                accessRouteId(candidate.stationId()), "core-route-provider",
                ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE, candidate.generatedAt(),
                textFacts("rentalCandidateId", rentalId(candidate.stationId()), "segmentType", "ACCESS"), Map.of());
    }

    private ConsumerAiEvidenceBundle.Evidence environmentEvidence(
            String id,
            JourneyCandidate selected,
            JourneyEvidencePort.EnvironmentEvidence result
    ) {
        Map<String, String> text = new LinkedHashMap<>(result.textFacts());
        text.put("rentalCandidateId", rentalId(selected.stationId()));
        return new ConsumerAiEvidenceBundle.Evidence(id, result.source(), status(result.status()), result.sourceTimestamp(),
                text, result.numericFacts());
    }

    private ConsumerAiEvidenceBundle.Evidence unavailableEnvironment(String id, String source, JourneyCandidate selected) {
        return new ConsumerAiEvidenceBundle.Evidence(id, source, ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE,
                null, Map.of("rentalCandidateId", rentalId(selected.stationId())), Map.of());
    }

    private ResolvedConstraints resolveConstraints(PlanInput input, JourneyIntent intent) {
        LinkedHashSet<String> themes = new LinkedHashSet<>();
        if (input.constraints() != null) addThemes(themes, input.constraints().themes());
        if (themes.isEmpty() && intent != null) {
            intent.preferences().forEach((key, value) -> {
                String normalized = normalize(key);
                if (value != null && value > 0 && THEMES.contains(normalized)) themes.add(normalized);
            });
            Object values = intent.hardConstraints().get("themes");
            if (values instanceof List<?> list) addThemes(themes, list.stream().map(String::valueOf).toList());
            Object value = intent.hardConstraints().get("theme");
            if (value != null) addThemes(themes, List.of(String.valueOf(value)));
        }
        Integer requestedStops = input.constraints() == null ? null : input.constraints().stopCount();
        if (requestedStops == null && intent != null && intent.hardConstraints().get("stopCount") instanceof Number number) {
            requestedStops = number.intValue();
        }
        int stopCount = requestedStops == null ? themes.isEmpty() ? 0 : Math.min(3, themes.size()) : requestedStops;
        Integer available = input.constraints() == null ? null : input.constraints().availableMinutes();
        int availableMinutes = available == null ? input.maxJourneyMinutes() : available;
        String routeMode = input.constraints() == null ? null : normalize(input.constraints().routeMode());
        if (routeMode == null && intent != null && intent.hardConstraints().get("routeMode") != null) {
            routeMode = normalize(String.valueOf(intent.hardConstraints().get("routeMode")));
        }
        if (routeMode == null || routeMode.isBlank()) routeMode = "BIKE_ONLY";
        if (stopCount < 0 || stopCount > 3 || !ROUTE_MODES.contains(routeMode)) throw new AiToolValueMismatch();
        return new ResolvedConstraints(List.copyOf(themes), stopCount, availableMinutes, routeMode);
    }

    private void addThemes(Set<String> target, List<String> values) {
        if (values == null) return;
        for (String value : values) {
            String normalized = normalize(value);
            if (!THEMES.contains(normalized)) throw new AiToolValueMismatch();
            target.add(normalized);
        }
    }

    private Decision save(
            long userId,
            String decisionId,
            int revision,
            PlanInput input,
            boolean useAiSchedule,
            JourneyIntent aiIntent,
            JourneyStatus status,
            List<JourneyCandidate> candidates,
            UnifiedJourneyPlan unifiedPlan,
            List<String> warnings
    ) {
        OffsetDateTime generatedAt = OffsetDateTime.now();
        JourneyDecisionPersistencePort.StoredDecision stored = persistence.save(new JourneyDecisionPersistencePort.DecisionToStore(
                decisionId, userId, revision, status.name(), normalizedIntent(input, useAiSchedule, aiIntent, unifiedPlan, warnings),
                CONTRACT_VERSIONS, generatedAt, candidates.stream().map(this::candidateToStore).toList()));
        return toDecision(stored, warnings);
    }

    private JourneyDecisionPersistencePort.CandidateToStore candidateToStore(JourneyCandidate candidate) {
        try {
            return new JourneyDecisionPersistencePort.CandidateToStore(candidate.candidateId(), candidate.archetype().name(),
                    objectMapper.writeValueAsString(candidate), "{\"source\":\"core-on-demand\"}");
        } catch (Exception exception) {
            throw new IllegalStateException("Journey candidate를 저장할 수 없습니다.", exception);
        }
    }

    private JourneyRentalPredictionPort.RentalCandidate findCoreCandidate(
            List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates,
            JourneyCandidate selected
    ) {
        if (selected == null) return null;
        return coreCandidates.stream().filter(candidate -> selected.stationId().equals(candidate.stationId()))
                .findFirst().orElse(null);
    }

    private List<JourneyCandidate> toJourneyCandidates(List<JourneyRentalPredictionPort.RentalCandidate> coreCandidates,
                                                        PlanInput input) {
        List<JourneyRentalPredictionPort.RentalCandidate> normalCandidates = coreCandidates.stream()
                .filter(candidate -> "NORMAL".equals(candidate.predictionStatus()))
                .sorted(Comparator.comparing(JourneyRentalPredictionPort.RentalCandidate::rentalProbability,
                                Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::durationSeconds,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::distanceMeters,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JourneyRentalPredictionPort.RentalCandidate::stationId,
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(3)
                .toList();
        return IntStream.range(0, normalCandidates.size())
                .mapToObj(index -> toJourneyCandidate(normalCandidates.get(index), input, index + 1))
                .toList();
    }

    private JourneyCandidate toJourneyCandidate(JourneyRentalPredictionPort.RentalCandidate candidate, PlanInput input, int rank) {
        return new JourneyCandidate(candidate.stationId(), JourneyArchetype.CORE_RENTAL, rank,
                candidate.rentalProbability(), null, null, candidate.distanceMeters(), null, null,
                input.destination().displayName(), null, null, null, candidate.stationId(), candidate.stationName(),
                candidate.latitude(), candidate.longitude(), candidate.requiredBikeCount(), candidate.availableBikeCount(),
                candidate.inventoryStatus(), candidate.inventoryCollectedAt(), candidate.availabilityLevel(),
                candidate.durationSeconds(), candidate.arrivalAt(), candidate.predictionTargetAt(), candidate.horizonMinutes(),
                candidate.featureAsOf(), candidate.modelVersion(), candidate.generatedAt(), candidate.predictionStatus());
    }

    private String normalizedIntent(
            PlanInput input,
            boolean useAiSchedule,
            JourneyIntent aiIntent,
            UnifiedJourneyPlan unifiedPlan,
            List<String> warnings
    ) {
        try {
            Map<String, Object> normalized = new LinkedHashMap<>();
            normalized.put("requestMode", input.requestMode());
            normalized.put("plannerMode", useAiSchedule ? RequestMode.NATURAL_LANGUAGE : input.requestMode());
            normalized.put("origin", input.origin());
            normalized.put("destination", input.destination());
            normalized.put("departureAt", input.departureAt());
            normalized.put("maxJourneyMinutes", input.maxJourneyMinutes());
            normalized.put("requiredBikeCount", input.requiredBikeCount());
            normalized.put("preferences", input.preferences());
            normalized.put("avoid", input.avoid());
            normalized.put("constraints", input.constraints());
            if (aiIntent != null) normalized.put("aiIntent", aiIntent);
            if (unifiedPlan != null) normalized.put("unifiedPlanSnapshot", unifiedPlan);
            normalized.put("internalWarnings", warnings);
            return objectMapper.writeValueAsString(normalized);
        } catch (Exception exception) {
            throw new IllegalStateException("Journey normalized intent를 저장할 수 없습니다.", exception);
        }
    }

    private JourneyCompileRequest compileRequest(PlanInput input) {
        return new JourneyCompileRequest(input.naturalLanguageText(), toPlaceReference(input.origin()),
                toPlaceReference(input.destination()), input.departureAt(), input.maxJourneyMinutes(), input.requiredBikeCount());
    }

    private void validateCompiledIntent(PlanInput input, JourneyIntent intent) {
        if (intent == null || !samePlace(input.origin(), intent.origin())
                || !samePlace(input.destination(), intent.destination())
                || intent.startAt() == null || !intent.startAt().isEqual(input.departureAt())
                || !input.maxJourneyMinutes().equals(intent.totalMinutes())
                || !input.requiredBikeCount().equals(intent.requiredBikeCount())) {
            throw new AiToolValueMismatch();
        }
    }

    private boolean samePlace(Place expected, PlaceReference actual) {
        if (expected == null || actual == null) return expected == null && actual == null;
        return expected.placeId().equals(actual.placeId()) && expected.displayName().equals(actual.displayName());
    }

    private PlaceReference toPlaceReference(Place place) {
        return place == null ? null : new PlaceReference(place.displayName(), place.placeId());
    }

    private Decision toDecision(JourneyDecisionPersistencePort.StoredDecision stored) { return toDecision(stored, null); }

    private Decision toDecision(JourneyDecisionPersistencePort.StoredDecision stored, List<String> suppliedWarnings) {
        try {
            ObjectNode storedNormalized = (ObjectNode) objectMapper.readTree(stored.normalizedIntentJson());
            UnifiedJourneyPlan unifiedPlan = storedNormalized.path("unifiedPlanSnapshot").isObject()
                    ? objectMapper.treeToValue(storedNormalized.path("unifiedPlanSnapshot"), UnifiedJourneyPlan.class) : null;
            List<String> warnings = suppliedWarnings == null ? readWarnings(storedNormalized, stored.status())
                    : List.copyOf(suppliedWarnings);
            ObjectNode publicNormalized = storedNormalized.deepCopy();
            publicNormalized.remove(List.of("unifiedPlanSnapshot", "internalWarnings"));
            List<JourneyCandidate> candidates = stored.candidates().stream()
                    .map(candidate -> readCandidate(candidate.snapshotJson()))
                    .sorted(Comparator.comparing(JourneyCandidate::rank, Comparator.nullsLast(Comparator.naturalOrder()))
                            .thenComparing(JourneyCandidate::candidateId, Comparator.nullsLast(Comparator.naturalOrder())))
                    .toList();
            return new Decision(stored.decisionId(), stored.revision(), JourneyStatus.valueOf(stored.status()),
                    publicNormalized, clarificationFor(stored.status(), publicNormalized), candidates, unifiedPlan,
                    warnings, stored.expiresAt());
        } catch (Exception exception) {
            throw new IllegalStateException("저장된 Journey decision을 읽을 수 없습니다.", exception);
        }
    }

    private JourneyCandidate readCandidate(String snapshot) {
        try {
            return objectMapper.readValue(snapshot, JourneyCandidate.class);
        } catch (Exception exception) {
            throw new IllegalStateException("저장된 Journey candidate를 읽을 수 없습니다.", exception);
        }
    }

    private List<String> readWarnings(JsonNode normalized, String status) {
        if (normalized.path("internalWarnings").isArray()) {
            List<String> warnings = new ArrayList<>();
            normalized.path("internalWarnings").forEach(value -> { if (value.isTextual()) warnings.add(value.asText()); });
            return List.copyOf(warnings);
        }
        return warningsFor(status);
    }

    private List<String> warningsFor(String status) {
        if (JourneyStatus.CLARIFICATION_REQUIRED.name().equals(status)) return List.of("CLARIFICATION_REQUIRED");
        if (JourneyStatus.PARTIAL.name().equals(status)) return List.of("JOURNEY_RENTAL_PARTIAL");
        if (JourneyStatus.READY.name().equals(status)) return List.of();
        return List.of("JOURNEY_RENTAL_UNAVAILABLE");
    }

    private JourneyIntent readAiIntent(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        try {
            return objectMapper.treeToValue(node, JourneyIntent.class);
        } catch (Exception exception) {
            throw new IllegalStateException("저장된 AI intent를 읽을 수 없습니다.", exception);
        }
    }

    private void handleAiFailure(JourneyAiException exception, List<String> warnings) {
        if (exception.code() == JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID) {
            throw new AiOutputSchemaInvalid(exception.failureStage());
        }
        if (exception.code() == JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH) throw new AiToolValueMismatch();
        addWarning(warnings, safeAiCode(exception.code()));
    }

    private String safeAiCode(JourneyAiErrorCode code) {
        if (code == null || code == JourneyAiErrorCode.AI_DISABLED) return JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE.name();
        return code.name();
    }

    private void validate(PlanInput input, boolean replan) {
        if (input == null || input.requestMode() == null || !validPlace(input.origin()) || !validOptionalPlace(input.destination())
                || input.departureAt() == null || !input.departureAt().isAfter(OffsetDateTime.now())
                || input.maxJourneyMinutes() == null || input.maxJourneyMinutes() < 1
                || input.requiredBikeCount() == null || input.requiredBikeCount() < 1 || input.requiredBikeCount() > 5
                || (input.requestMode() == RequestMode.NATURAL_LANGUAGE && blank(input.naturalLanguageText()))
                || (replan && (input.expectedRevision() == null || input.requestMode() == RequestMode.NATURAL_LANGUAGE
                || !blank(input.naturalLanguageText()))) || !validConstraints(input.constraints())) {
            throw new InvalidJourneyInput();
        }
    }

    private boolean validConstraints(PlanConstraints constraints) {
        if (constraints == null) return true;
        if (constraints.availableMinutes() != null
                && (constraints.availableMinutes() < 1 || constraints.availableMinutes() > 480)) return false;
        if (constraints.stopCount() != null && (constraints.stopCount() < 1 || constraints.stopCount() > 3)) return false;
        if (constraints.routeMode() != null && !ROUTE_MODES.contains(normalize(constraints.routeMode()))) return false;
        return constraints.themes().stream().map(this::normalize).allMatch(THEMES::contains);
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }
    private boolean validOptionalPlace(Place place) { return place == null || validPlace(place); }
    private boolean validPlace(Place place) {
        return place != null && !blank(place.placeId()) && !blank(place.displayName())
                && finiteBetween(place.latitude(), -90, 90) && finiteBetween(place.longitude(), -180, 180);
    }
    private boolean finiteBetween(Double value, double minimum, double maximum) {
        return value != null && Double.isFinite(value) && value >= minimum && value <= maximum;
    }

    private Clarification clarificationFor(String status, JsonNode normalizedIntent) {
        if (!JourneyStatus.CLARIFICATION_REQUIRED.name().equals(status)) return null;
        List<String> missingFields = new ArrayList<>();
        if (normalizedIntent.path("destination").isMissingNode() || normalizedIntent.path("destination").isNull()) {
            missingFields.add("destination");
        }
        for (JsonNode field : normalizedIntent.path("aiIntent").path("missingFields")) {
            if (field.isTextual() && !field.asText().isBlank() && !missingFields.contains(field.asText())) {
                missingFields.add(field.asText());
            }
        }
        return new Clarification("추가 여정 조건을 확인해 주세요.", List.copyOf(missingFields));
    }

    private Map<String, String> textFacts(String... entries) {
        Map<String, String> facts = new LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            if (entries[index + 1] != null) facts.put(entries[index], entries[index + 1]);
        }
        return facts;
    }

    private Map<String, BigDecimal> numericFacts(Object... entries) {
        Map<String, BigDecimal> facts = new LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) {
            if (entries[index + 1] != null) facts.put((String) entries[index], (BigDecimal) entries[index + 1]);
        }
        return facts;
    }

    private ConsumerAiEvidenceBundle.EvidenceStatus status(String value) {
        try { return ConsumerAiEvidenceBundle.EvidenceStatus.valueOf(value); }
        catch (Exception exception) { return ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE; }
    }

    private String normalize(String value) { return value == null ? null : value.trim().toUpperCase(Locale.ROOT); }
    private String string(Object value) { return value == null ? null : value.toString(); }
    private BigDecimal decimal(Number value) { return value == null ? null : new BigDecimal(value.toString()); }
    private void addWarning(List<String> warnings, String warning) {
        if (warning != null && !warning.isBlank() && !warnings.contains(warning)) warnings.add(warning);
    }
    private void appendWarnings(List<String> warnings, List<String> additions) {
        if (additions != null) additions.forEach(warning -> addWarning(warnings, warning));
    }
    private boolean containsNumericToken(String text) { return text.codePoints().anyMatch(Character::isDigit); }
    private String rentalId(String stationId) { return "rental:" + stationId; }
    private String accessRouteId(String stationId) { return "route:access:" + stationId; }
    private String poiId(String stationId, String placeId) { return "poi:" + stationId + ":" + placeId; }
    private String routeId(String fromEvidenceId, String toEvidenceId) { return "route:" + fromEvidenceId + "->" + toEvidenceId; }

    public enum RequestMode { FORM, NATURAL_LANGUAGE }
    public record Place(String placeId, String displayName, Double latitude, Double longitude) { }

    public record PlanConstraints(Integer availableMinutes, List<String> themes, Integer stopCount, String routeMode) {
        public PlanConstraints { themes = themes == null ? List.of() : List.copyOf(themes); }
    }

    public record PlanInput(
            RequestMode requestMode, String naturalLanguageText, Place origin, Place destination,
            OffsetDateTime departureAt, Integer maxJourneyMinutes, Integer requiredBikeCount,
            Map<String, Object> preferences, List<String> avoid, Integer expectedRevision, PlanConstraints constraints
    ) {
        public PlanInput {
            preferences = preferences == null ? Map.of() : Map.copyOf(preferences);
            avoid = avoid == null ? List.of() : List.copyOf(avoid);
        }
        public PlanInput(RequestMode requestMode, String naturalLanguageText, Place origin, Place destination,
                         OffsetDateTime departureAt, Integer maxJourneyMinutes, Integer requiredBikeCount,
                         Map<String, Object> preferences, List<String> avoid, Integer expectedRevision) {
            this(requestMode, naturalLanguageText, origin, destination, departureAt, maxJourneyMinutes,
                    requiredBikeCount, preferences, avoid, expectedRevision, null);
        }
    }

    public record Decision(
            String decisionId, Integer revision, JourneyStatus status, JsonNode normalizedIntent,
            Clarification clarification, List<JourneyCandidate> candidates, UnifiedJourneyPlan unifiedPlan,
            List<String> warnings, OffsetDateTime expiresAt
    ) {
        public Decision(String decisionId, Integer revision, JourneyStatus status, JsonNode normalizedIntent,
                        Clarification clarification, List<JourneyCandidate> candidates, List<String> warnings,
                        OffsetDateTime expiresAt) {
            this(decisionId, revision, status, normalizedIntent, clarification, candidates, null, warnings, expiresAt);
        }
    }

    public record Clarification(String question, List<String> missingFields) { }
    public record Counterfactual(String status, List<String> unavailableFields) { }
    private record PlannerContext(boolean useAiSchedule, JourneyIntent aiIntent) { }
    private record ResolvedConstraints(List<String> themes, int stopCount, int availableMinutes, String routeMode) { }
    private record RouteLink(String fromEvidenceId, String toEvidenceId, JourneyEvidencePort.RouteEvidence route) { }

    public static class InvalidJourneyInput extends RuntimeException { }
    public static class DecisionMissing extends RuntimeException { }
    public static class DecisionExpired extends RuntimeException { }
    public static class RevisionConflict extends RuntimeException { }
    public static class NoValidCandidate extends RuntimeException { }
    public static class AiOutputSchemaInvalid extends RuntimeException {
        private final JourneyAiFailureStage failureStage;
        public AiOutputSchemaInvalid(JourneyAiFailureStage failureStage) { this.failureStage = failureStage; }
        public JourneyAiFailureStage failureStage() { return failureStage; }
    }
    public static class AiToolValueMismatch extends RuntimeException { }
}
