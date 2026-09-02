package com.ddarungflow.ridingguide;

import com.ddarungflow.airquality.AirQualityResponse;
import com.ddarungflow.airquality.AirQualityService;
import com.ddarungflow.entity.Users;
import com.ddarungflow.journey.ai.ConsumerAiEvidenceBundle;
import com.ddarungflow.journey.ai.EvidenceSelectionValidator;
import com.ddarungflow.journey.ai.JourneyAiErrorCode;
import com.ddarungflow.journey.ai.JourneyAiException;
import com.ddarungflow.journey.application.JourneyPlanService;
import com.ddarungflow.journey.domain.JourneyCandidate;
import com.ddarungflow.map.KakaoMapClient;
import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.MapPredictionService;
import com.ddarungflow.map.NearbyPlaceService;
import com.ddarungflow.map.PredictionApiDtos;
import com.ddarungflow.map.StationQueryService;
import com.ddarungflow.payment.PremiumEntitlementService;
import com.ddarungflow.weather.WeatherArrivalService;
import com.ddarungflow.weather.WeatherForecastResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class RidingGuideService {
    private static final EvidenceSelectionValidator.StayMinutesBounds STAY_BOUNDS =
            new EvidenceSelectionValidator.StayMinutesBounds(10, 120);
    private static final Pattern NUMERIC_LEXEME = Pattern.compile(
            "[+\\-]?\\p{Nd}+(?:[.,eE+\\-_'’/:]+\\p{Nd}+)*(?:[%％٪])?");
    private static final Pattern CANONICAL_NUMERIC_LEXEME = Pattern.compile(
            "-?(?:0|[1-9]\\d*)(?:\\.\\d+)?%?");
    private static final Pattern EMBEDDED_NUMERIC_LEXEME = Pattern.compile("\\p{Nd}\\p{L}+\\p{Nd}");

    private final PremiumEntitlementService entitlement;
    private final StationQueryService stationQueryService;
    private final MapPredictionService predictionService;
    private final WeatherArrivalService weatherService;
    private final AirQualityService airQualityService;
    private final NearbyPlaceService nearbyPlaceService;
    private final JourneyPlanService journeyPlanService;
    private final RidingGuideAiGateway aiGateway;
    private final EvidenceSelectionValidator selectionValidator = new EvidenceSelectionValidator();
    private final Clock clock;

    @Autowired
    public RidingGuideService(
            PremiumEntitlementService entitlement,
            StationQueryService stationQueryService,
            MapPredictionService predictionService,
            WeatherArrivalService weatherService,
            AirQualityService airQualityService,
            NearbyPlaceService nearbyPlaceService,
            JourneyPlanService journeyPlanService,
            RidingGuideAiGateway aiGateway
    ) {
        this(entitlement, stationQueryService, predictionService, weatherService, airQualityService,
                nearbyPlaceService, journeyPlanService, aiGateway, Clock.systemUTC());
    }

    RidingGuideService(
            PremiumEntitlementService entitlement,
            StationQueryService stationQueryService,
            MapPredictionService predictionService,
            WeatherArrivalService weatherService,
            AirQualityService airQualityService,
            NearbyPlaceService nearbyPlaceService,
            JourneyPlanService journeyPlanService,
            RidingGuideAiGateway aiGateway,
            Clock clock
    ) {
        this.entitlement = entitlement;
        this.stationQueryService = stationQueryService;
        this.predictionService = predictionService;
        this.weatherService = weatherService;
        this.airQualityService = airQualityService;
        this.nearbyPlaceService = nearbyPlaceService;
        this.journeyPlanService = journeyPlanService;
        this.aiGateway = aiGateway;
        this.clock = clock;
    }

    public RidingGuideDtos.Response generate(Users user, RidingGuideDtos.Request request) {
        validate(request);
        entitlement.requireActive(user);

        MapApiDtos.StationLocationResponseDto station = stationQueryService.findActiveLocation(request.stationId())
                .orElseThrow(StationNotFound::new);
        QueryContext context = resolveContext(user, request);
        List<String> warnings = new ArrayList<>();

        PredictionApiDtos.CandidatePredictionResponseDto prediction = fetchPrediction(request, context, warnings);
        Map<String, ConsumerAiEvidenceBundle.Evidence> rental = rentalEvidence(prediction, context.journeyCandidate(), warnings);
        Map<String, ConsumerAiEvidenceBundle.Evidence> weather = weatherEvidence(station, prediction, context, warnings);
        Map<String, ConsumerAiEvidenceBundle.Evidence> airQuality = airQualityEvidence(station.stationId(), warnings);
        Map<String, ConsumerAiEvidenceBundle.Evidence> pois = poiEvidence(request, warnings);

        ConsumerAiEvidenceBundle bundle = new ConsumerAiEvidenceBundle(rental, pois, Map.of(), weather, airQuality);
        if (rental.isEmpty()) {
            if (!warnings.contains("RENTAL_CONTEXT_MISSING")) warnings.add("RENTAL_CONTEXT_MISSING");
            return partial(station.stationId(), bundle, "RENTAL_CONTEXT_MISSING", warnings,
                    RidingGuideDtos.AiStatus.PARTIAL);
        }

        try {
            RidingGuideAiGateway.GuideOutput generated = aiGateway.generate(bundle);
            validateGeneratedText(generated);
            EvidenceSelectionValidator.ValidatedSelection validated = selectionValidator.validate(
                    bundle, generated.selection(), STAY_BOUNDS);
            validateGroundedNumericText(generated);
            List<RidingGuideDtos.ItineraryStop> preview = generated.stops().stream()
                    .map(stop -> new RidingGuideDtos.ItineraryStop(stop.poiId(), stop.stayMinutes(), stop.rationale()))
                    .toList();
            boolean factualPartial = !warnings.isEmpty() || containsNonNormal(bundle);
            return new RidingGuideDtos.Response(
                    station.stationId(),
                    factualPartial ? RidingGuideDtos.Status.PARTIAL : RidingGuideDtos.Status.NORMAL,
                    RidingGuideDtos.AiStatus.AVAILABLE,
                    null,
                    bundle,
                    generated.guideSummary(),
                    preview,
                    validated.rationale(),
                    validated.rationaleTags(),
                    warnings
            );
        } catch (JourneyAiException exception) {
            return partial(station.stationId(), bundle, exception.code().name(), warnings,
                    RidingGuideDtos.AiStatus.UNAVAILABLE);
        } catch (RuntimeException exception) {
            return partial(station.stationId(), bundle, JourneyAiErrorCode.AI_PROVIDER_UNAVAILABLE.name(), warnings,
                    RidingGuideDtos.AiStatus.UNAVAILABLE);
        }
    }

    private QueryContext resolveContext(Users user, RidingGuideDtos.Request request) {
        Integer minutesAhead = request.minutesAhead();
        Integer requiredBikeCount = request.requiredBikeCount() == null ? 1 : request.requiredBikeCount();
        if (request.journeyDecisionId() == null || request.journeyDecisionId().isBlank()) {
            return new QueryContext(minutesAhead, requiredBikeCount, null);
        }
        JourneyPlanService.Decision decision = journeyPlanService.find(user.getId(), request.journeyDecisionId());
        JourneyCandidate candidate = decision.candidates().stream()
                .filter(item -> request.stationId().equals(item.stationId()))
                .findFirst()
                .orElseThrow(InvalidInput::new);
        if (minutesAhead == null && candidate.arrivalAt() != null) {
            long derived = Duration.between(OffsetDateTime.now(clock), candidate.arrivalAt()).toMinutes();
            if (derived > 0 && derived <= 240) minutesAhead = Math.toIntExact(derived);
        }
        if (request.requiredBikeCount() == null && candidate.requiredBikeCount() != null) {
            requiredBikeCount = candidate.requiredBikeCount();
        }
        return new QueryContext(minutesAhead, requiredBikeCount, candidate);
    }

    private PredictionApiDtos.CandidatePredictionResponseDto fetchPrediction(
            RidingGuideDtos.Request request,
            QueryContext context,
            List<String> warnings
    ) {
        if (context.journeyCandidate() != null || context.minutesAhead() == null) return null;
        try {
            return predictionService.buildDirectRoute(
                            request.stationId(), request.originLatitude(), request.originLongitude(), "WALK",
                            context.minutesAhead(), context.requiredBikeCount())
                    .stream()
                    .filter(candidate -> request.stationId().equals(candidate.stationId()))
                    .findFirst()
                    .orElse(null);
        } catch (RuntimeException exception) {
            warnings.add("RENTAL_PREDICTION_UNAVAILABLE");
            return null;
        }
    }

    private Map<String, ConsumerAiEvidenceBundle.Evidence> rentalEvidence(
            PredictionApiDtos.CandidatePredictionResponseDto prediction,
            JourneyCandidate journeyCandidate,
            List<String> warnings
    ) {
        if (journeyCandidate != null) return journeyRentalEvidence(journeyCandidate, warnings);
        if (prediction == null || prediction.predictionStatus() != PredictionApiDtos.PredictionStatus.NORMAL
                || prediction.probabilities() == null || prediction.predictionProbability() == null) {
            if (prediction != null) warnings.add("RENTAL_PREDICTION_" + nameOrUnavailable(prediction.predictionStatus()));
            return Map.of();
        }
        Map<String, String> text = facts(
                "stationId", prediction.stationId(),
                "stationName", prediction.stationName(),
                "predictionStatus", prediction.predictionStatus().name(),
                "inventoryStatus", name(prediction.inventoryStatus()),
                "availabilityLevel", name(prediction.availabilityLevel()),
                "modelVersion", prediction.modelVersion(),
                "inventoryCollectedAt", time(prediction.inventoryCollectedAt()),
                "arrivalAt", time(prediction.arrivalAt()),
                "predictionTargetAt", time(prediction.predictionTargetAt()),
                "featureAsOf", time(prediction.featureAsOf()),
                "generatedAt", time(prediction.generatedAt()),
                "expiresAt", time(prediction.expiresAt())
        );
        Map<String, BigDecimal> numeric = numericFacts(
                "rentalProbability", prediction.predictionProbability(),
                "requiredBikeCount", decimal(prediction.requiredBikeCount()),
                "availableBikeCount", decimal(prediction.availableBikeCount()),
                "atLeast1", prediction.probabilities().atLeast1(),
                "atLeast2", prediction.probabilities().atLeast2(),
                "atLeast3", prediction.probabilities().atLeast3(),
                "atLeast4", prediction.probabilities().atLeast4(),
                "atLeast5", prediction.probabilities().atLeast5()
        );
        String evidenceId = "rental:" + prediction.stationId();
        ConsumerAiEvidenceBundle.Evidence evidence = new ConsumerAiEvidenceBundle.Evidence(
                evidenceId, "core-on-demand-prediction", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                prediction.generatedAt(), text, numeric);
        return Map.of(evidenceId, evidence);
    }

    private Map<String, ConsumerAiEvidenceBundle.Evidence> journeyRentalEvidence(
            JourneyCandidate candidate,
            List<String> warnings
    ) {
        if (!"NORMAL".equals(candidate.predictionStatus()) || candidate.rentalProbability() == null) {
            warnings.add("RENTAL_PREDICTION_" + (candidate.predictionStatus() == null ? "UNAVAILABLE" : candidate.predictionStatus()));
            return Map.of();
        }
        String evidenceId = "rental:" + candidate.stationId();
        ConsumerAiEvidenceBundle.Evidence evidence = new ConsumerAiEvidenceBundle.Evidence(
                evidenceId,
                "journey-decision-core-prediction",
                ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL,
                candidate.generatedAt(),
                facts(
                        "stationId", candidate.stationId(),
                        "stationName", candidate.stationName(),
                        "predictionStatus", candidate.predictionStatus(),
                        "inventoryStatus", candidate.inventoryStatus(),
                        "availabilityLevel", candidate.availabilityLevel(),
                        "modelVersion", candidate.modelVersion(),
                        "inventoryCollectedAt", time(candidate.inventoryCollectedAt()),
                        "arrivalAt", time(candidate.arrivalAt()),
                        "predictionTargetAt", time(candidate.predictionTargetAt()),
                        "featureAsOf", time(candidate.featureAsOf()),
                        "generatedAt", time(candidate.generatedAt())
                ),
                numericFacts(
                        "rentalProbability", candidate.rentalProbability(),
                        "requiredBikeCount", decimal(candidate.requiredBikeCount()),
                        "availableBikeCount", decimal(candidate.availableBikeCount())
                )
        );
        return Map.of(evidenceId, evidence);
    }

    private Map<String, ConsumerAiEvidenceBundle.Evidence> weatherEvidence(
            MapApiDtos.StationLocationResponseDto station,
            PredictionApiDtos.CandidatePredictionResponseDto prediction,
            QueryContext context,
            List<String> warnings
    ) {
        OffsetDateTime arrivalAt = context.journeyCandidate() != null
                ? context.journeyCandidate().arrivalAt()
                : prediction == null ? null : prediction.arrivalAt();
        if (arrivalAt == null && context.minutesAhead() != null) {
            arrivalAt = OffsetDateTime.now(clock).plusMinutes(context.minutesAhead());
        }
        if (arrivalAt == null) return Map.of();
        WeatherForecastResult result;
        try {
            result = weatherService.getArrivalWeather(station.latitude(), station.longitude(), arrivalAt);
        } catch (RuntimeException exception) {
            warnings.add("WEATHER_UNAVAILABLE");
            String evidenceId = "weather:" + station.stationId();
            return Map.of(evidenceId, new ConsumerAiEvidenceBundle.Evidence(
                    evidenceId, "kma-short-forecast", ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE,
                    null, Map.of(), Map.of()));
        }
        ConsumerAiEvidenceBundle.EvidenceStatus status = status(result.status().name());
        if (status != ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL) warnings.add("WEATHER_" + status.name());
        Map<String, String> text = facts(
                "skyStatus", result.skyStatus(),
                "isRainy", result.isRainy() == null ? null : result.isRainy().toString(),
                "arrivalAt", time(result.arrivalAt()),
                "forecastAt", time(result.forecastAt()),
                "announcedAt", time(result.announcedAt()),
                "fetchedAt", time(result.fetchedAt())
        );
        Map<String, BigDecimal> numeric = numericFacts(
                "temperatureCelsius", decimal(result.temperature()),
                "precipitationProbabilityPercent", decimal(result.pop()),
                "precipitationTypeCode", decimal(result.pty())
        );
        String evidenceId = "weather:" + station.stationId();
        return Map.of(evidenceId, new ConsumerAiEvidenceBundle.Evidence(
                evidenceId, "kma-short-forecast", status,
                result.announcedAt() != null ? result.announcedAt() : result.fetchedAt(), text, numeric));
    }

    private Map<String, ConsumerAiEvidenceBundle.Evidence> airQualityEvidence(
            String stationId,
            List<String> warnings
    ) {
        Optional<AirQualityResponse> optional;
        try {
            optional = airQualityService.getAirQuality(stationId);
        } catch (RuntimeException exception) {
            optional = Optional.empty();
        }
        AirQualityResponse result = optional.orElseGet(() -> AirQualityResponse.unavailable(stationId, null, null, null));
        ConsumerAiEvidenceBundle.EvidenceStatus status = status(result.status());
        if (status != ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL) warnings.add("AIR_QUALITY_" + status.name());
        Map<String, String> text = facts(
                "measurementStation", result.measurementStation() == null ? null : result.measurementStation().name(),
                "khaiGrade", result.khai() == null ? null : result.khai().grade(),
                "pm10Grade", result.pm10() == null ? null : result.pm10().grade(),
                "pm25Grade", result.pm25() == null ? null : result.pm25().grade(),
                "o3Grade", result.o3() == null ? null : result.o3().grade(),
                "measuredAt", time(result.measuredAt()),
                "collectedAt", time(result.collectedAt())
        );
        Map<String, BigDecimal> numeric = numericFacts(
                "measurementDistanceMeters", result.measurementStation() == null ? null : decimal(result.measurementStation().distanceMeters()),
                "khai", result.khai() == null ? null : decimal(result.khai().value()),
                "pm10", result.pm10() == null ? null : decimal(result.pm10().value()),
                "pm25", result.pm25() == null ? null : decimal(result.pm25().value()),
                "o3", result.o3() == null ? null : decimal(result.o3().value())
        );
        String evidenceId = "air-quality:" + stationId;
        return Map.of(evidenceId, new ConsumerAiEvidenceBundle.Evidence(
                evidenceId, "air-korea", status,
                result.measuredAt() != null ? result.measuredAt() : result.collectedAt(), text, numeric));
    }

    private Map<String, ConsumerAiEvidenceBundle.Evidence> poiEvidence(
            RidingGuideDtos.Request request,
            List<String> warnings
    ) {
        if (request.poiTheme() == null || request.poiTheme().isBlank()) return Map.of();
        List<MapApiDtos.NearbyPlaceResponseDto> places;
        try {
            places = nearbyPlaceService.findNearby(request.stationId(), request.poiTheme(), request.poiLimit());
        } catch (IllegalArgumentException exception) {
            throw new InvalidInput();
        } catch (KakaoMapClient.ProviderException exception) {
            warnings.add("POI_PROVIDER_UNAVAILABLE");
            return Map.of();
        }
        Map<String, ConsumerAiEvidenceBundle.Evidence> evidence = new LinkedHashMap<>();
        for (MapApiDtos.NearbyPlaceResponseDto place : places) {
            String evidenceId = "poi:" + place.placeId();
            evidence.put(evidenceId, new ConsumerAiEvidenceBundle.Evidence(
                    evidenceId, "kakao-local", ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL, null,
                    facts("placeId", place.placeId(), "name", place.name(), "address", place.address(), "category", place.category()),
                    numericFacts("latitude", place.latitude(), "longitude", place.longitude(),
                            "distanceMeters", decimal(place.distanceMeters()))));
        }
        return evidence;
    }

    private RidingGuideDtos.Response partial(
            String stationId,
            ConsumerAiEvidenceBundle bundle,
            String code,
            List<String> warnings,
            RidingGuideDtos.AiStatus aiStatus
    ) {
        return new RidingGuideDtos.Response(
                stationId, RidingGuideDtos.Status.PARTIAL, aiStatus, code, bundle,
                null, List.of(), null, List.of(), warnings);
    }

    private void validate(RidingGuideDtos.Request request) {
        if (request == null || request.stationId() == null || request.stationId().isBlank()) throw new InvalidInput();
        if ((request.originLatitude() == null) != (request.originLongitude() == null)) throw new InvalidInput();
        if (request.originLatitude() != null
                && (request.originLatitude().compareTo(BigDecimal.valueOf(-90)) < 0
                || request.originLatitude().compareTo(BigDecimal.valueOf(90)) > 0
                || request.originLongitude().compareTo(BigDecimal.valueOf(-180)) < 0
                || request.originLongitude().compareTo(BigDecimal.valueOf(180)) > 0)) throw new InvalidInput();
        if (request.minutesAhead() != null && (request.minutesAhead() < 1 || request.minutesAhead() > 240)) throw new InvalidInput();
        if (request.requiredBikeCount() != null && (request.requiredBikeCount() < 1 || request.requiredBikeCount() > 5)) throw new InvalidInput();
        if (request.poiLimit() != null && (request.poiTheme() == null || request.poiTheme().isBlank())) throw new InvalidInput();
        boolean hasDecision = request.journeyDecisionId() != null && !request.journeyDecisionId().isBlank();
        if (!hasDecision && request.minutesAhead() != null && request.originLatitude() == null) throw new InvalidInput();
        if (!hasDecision && request.originLatitude() != null && request.minutesAhead() == null) throw new InvalidInput();
    }

    private void validateGeneratedText(RidingGuideAiGateway.GuideOutput generated) {
        if (generated == null || generated.guideSummary() == null || generated.guideSummary().isBlank()
                || generated.rationale() == null || generated.rationale().isBlank()
                || generated.stops().size() > 3
                || generated.stops().stream().anyMatch(stop -> stop == null || stop.rationale() == null
                || stop.rationale().isBlank())) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_OUTPUT_SCHEMA_INVALID,
                    "riding guide output text is missing");
        }
    }

    private void validateGroundedNumericText(RidingGuideAiGateway.GuideOutput generated) {
        validateGroundedNumericText(generated.guideSummary(), generated.factValues(), List.of());
        validateGroundedNumericText(generated.rationale(), generated.factValues(), List.of());
        generated.stops().forEach(stop -> validateGroundedNumericText(
                stop.rationale(), generated.factValues(), List.of(BigDecimal.valueOf(stop.stayMinutes()))));
    }

    private void validateGroundedNumericText(
            String text,
            List<ConsumerAiEvidenceBundle.FactValue> factValues,
            List<BigDecimal> stayMinutes
    ) {
        if (EMBEDDED_NUMERIC_LEXEME.matcher(text).find()) {
            throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH,
                    "numeric guide text is not a canonical decimal");
        }
        Matcher matcher = NUMERIC_LEXEME.matcher(text);
        while (matcher.find()) {
            String lexeme = matcher.group();
            if (!CANONICAL_NUMERIC_LEXEME.matcher(lexeme).matches()) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH,
                        "numeric guide text is not a canonical decimal");
            }
            boolean percent = lexeme.endsWith("%");
            String decimal = percent ? lexeme.substring(0, lexeme.length() - 1) : lexeme;
            BigDecimal mentioned = new BigDecimal(decimal);
            boolean groundedByFact = factValues.stream().anyMatch(fact ->
                    mentioned.compareTo(fact.value()) == 0
                            && (!percent || isPercentFact(fact.reference())));
            boolean groundedByStay = !percent && stayMinutes.stream()
                    .anyMatch(stay -> mentioned.compareTo(stay) == 0);
            if (!groundedByFact && !groundedByStay) {
                throw new JourneyAiException(JourneyAiErrorCode.AI_TOOL_VALUE_MISMATCH,
                        "numeric guide text is not backed by evidence");
            }
        }
    }

    private boolean isPercentFact(ConsumerAiEvidenceBundle.FactReference reference) {
        return reference != null
                && reference.factName() != null
                && reference.factName().toLowerCase(java.util.Locale.ROOT).endsWith("percent");
    }

    private boolean containsNonNormal(ConsumerAiEvidenceBundle bundle) {
        return List.of(bundle.rentalCandidates(), bundle.pois(), bundle.routes(), bundle.weather(), bundle.airQuality())
                .stream().flatMap(map -> map.values().stream())
                .anyMatch(evidence -> evidence.status() != ConsumerAiEvidenceBundle.EvidenceStatus.NORMAL);
    }

    private ConsumerAiEvidenceBundle.EvidenceStatus status(String status) {
        try {
            return ConsumerAiEvidenceBundle.EvidenceStatus.valueOf(status);
        } catch (Exception exception) {
            return ConsumerAiEvidenceBundle.EvidenceStatus.UNAVAILABLE;
        }
    }

    private Map<String, String> facts(String... entries) {
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

    private BigDecimal decimal(Number value) {
        return value == null ? null : new BigDecimal(value.toString());
    }

    private String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private String time(OffsetDateTime value) {
        return value == null ? null : value.toString();
    }

    private String nameOrUnavailable(Enum<?> value) {
        return value == null ? "UNAVAILABLE" : value.name();
    }

    private record QueryContext(Integer minutesAhead, int requiredBikeCount, JourneyCandidate journeyCandidate) { }

    public static class InvalidInput extends RuntimeException { }
    public static class StationNotFound extends RuntimeException { }
}
