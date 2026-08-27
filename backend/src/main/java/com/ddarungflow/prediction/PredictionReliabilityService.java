package com.ddarungflow.prediction;

import com.ddarungflow.dto.PredictionReliabilityDtos;
import com.ddarungflow.entity.ModelPerformanceRun;
import com.ddarungflow.repository.ModelPerformanceRunRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class PredictionReliabilityService {
    private static final String DISCLOSURE = "겨울 8일 구간 평가 결과이며 계절성은 반영되지 않았습니다.";

    private final ModelPerformanceRunRepository runs;
    private final ObjectMapper mapper;

    public PredictionReliabilityService(ModelPerformanceRunRepository runs, ObjectMapper mapper) {
        this.runs = runs;
        this.mapper = mapper;
    }

    public PredictionReliabilityDtos.Response find(int horizonMinutes, int requiredBikeCount, double probability) {
        if (probability < 0 || probability > 1) throw new IllegalArgumentException("probability must be between zero and one");

        ModelPerformanceRun run = runs.findFirstByOrderByGeneratedAtDesc()
                .orElseThrow(ReliabilityNotAvailableException::new);
        JsonNode payload = payload(run.getPayload());
        JsonNode calibration = findCombination(payload.path("combinationCalibration"), horizonMinutes, requiredBikeCount);
        JsonNode combination = findCombination(payload.path("combinations"), horizonMinutes, requiredBikeCount);
        JsonNode band = findBand(calibration.path("bins"), probability);
        if (calibration.isMissingNode() || combination.isMissingNode() || band.isMissingNode()) {
            throw new ReliabilityNotAvailableException();
        }

        int threshold = payload.path("evaluation").path("minSampleThreshold").asInt(1000);
        int sampleCount = band.path("sampleCount").asInt();
        Double actualRate = nullableDouble(band.get("actualRate"));
        Double meanPredicted = nullableDouble(band.get("meanPredicted"));
        boolean unknown = sampleCount < threshold || actualRate == null;
        Double calibrationErrorPercent = unknown || meanPredicted == null
                ? null
                : BigDecimal.valueOf(meanPredicted).subtract(BigDecimal.valueOf(actualRate)).abs().movePointRight(2).doubleValue();
        String reliabilityLevel = unknown ? "UNKNOWN"
                : calibrationErrorPercent <= 2 ? "HIGH"
                : calibrationErrorPercent <= 6 ? "MEDIUM"
                : "LOW";

        return new PredictionReliabilityDtos.Response(
                run.getModelVersion(),
                run.getGeneratedAt(),
                new PredictionReliabilityDtos.Combination(horizonMinutes, requiredBikeCount, combination.path("sampleCount").asInt()),
                new PredictionReliabilityDtos.Band(
                        band.path("binLowerPercent").asInt(),
                        band.path("binUpperPercent").asInt(),
                        sampleCount,
                        unknown ? null : meanPredicted,
                        unknown ? null : actualRate,
                        calibrationErrorPercent
                ),
                reliabilityLevel,
                DISCLOSURE
        );
    }

    private JsonNode findCombination(JsonNode combinations, int horizonMinutes, int requiredBikeCount) {
        for (JsonNode combination : combinations) {
            if (combination.path("horizonMinutes").asInt() == horizonMinutes
                    && combination.path("requiredBikeCount").asInt() == requiredBikeCount) {
                return combination;
            }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private JsonNode findBand(JsonNode bands, double probability) {
        int percent = (int) Math.floor(probability * 100);
        for (JsonNode band : bands) {
            int lower = band.path("binLowerPercent").asInt();
            int upper = band.path("binUpperPercent").asInt();
            if (percent >= lower && (percent < upper || upper == 100 && percent == 100)) return band;
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private Double nullableDouble(JsonNode value) {
        return value == null || value.isNull() ? null : value.asDouble();
    }

    private JsonNode payload(JsonNode value) {
        if (!value.isTextual()) return value;
        try {
            return mapper.readTree(value.asText());
        } catch (JsonProcessingException error) {
            throw new ReliabilityNotAvailableException();
        }
    }

    public static class ReliabilityNotAvailableException extends RuntimeException { }
}
