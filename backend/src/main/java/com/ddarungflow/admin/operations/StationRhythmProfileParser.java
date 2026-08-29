package com.ddarungflow.admin.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Component
public class StationRhythmProfileParser {
    private final ObjectMapper objectMapper;

    public StationRhythmProfileParser(ObjectMapper objectMapper) { this.objectMapper = objectMapper; }

    public Parsed parse(String rawPayload) {
        try {
            JsonNode root = objectMapper.readTree(rawPayload);
            if (root != null && root.isTextual()) root = objectMapper.readTree(root.asText());
            if (root == null || !root.isObject() || !root.path("weekdayHourly").isArray() || !root.path("stockout").isObject()) return Parsed.invalid();
            Map<CellKey, Cell> cells = new HashMap<>();
            boolean partial = false;
            for (JsonNode node : root.path("weekdayHourly")) {
                if (!node.isObject() || !node.path("dayOfWeek").canConvertToInt() || !node.path("hourOfDay").canConvertToInt()
                        || !node.path("sampleCount").canConvertToLong() || !node.path("medianBikeCount").isNumber() || !node.path("stockoutRate").isNumber()) { partial = true; continue; }
                int day = node.path("dayOfWeek").asInt(); int hour = node.path("hourOfDay").asInt(); long samples = node.path("sampleCount").asLong();
                BigDecimal rate = node.path("stockoutRate").decimalValue();
                if (day < 1 || day > 7 || hour < 0 || hour > 23 || samples < 10 || rate.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(BigDecimal.ONE) > 0) { partial = true; continue; }
                CellKey key = new CellKey(day, hour);
                if (cells.putIfAbsent(key, new Cell(day, hour, samples, node.path("medianBikeCount").decimalValue(), rate)) != null) partial = true;
            }
            JsonNode stockout = root.path("stockout");
            if (!stockout.path("episodeCount").canConvertToLong()) return Parsed.invalid();
            return new Parsed(true, partial, cells, new Stockout(stockout.path("episodeCount").asLong(), decimalOrNull(stockout, "medianDurationMinutes"),
                    decimalOrNull(stockout, "p90DurationMinutes"), decimalOrNull(stockout, "medianRecoveryMinutesToThree")));
        } catch (RuntimeException | java.io.IOException error) { return Parsed.invalid(); }
    }

    private BigDecimal decimalOrNull(JsonNode node, String field) { return node.path(field).isNumber() ? node.path(field).decimalValue() : null; }
    public record CellKey(int dayOfWeek, int hourOfDay) { }
    public record Cell(int dayOfWeek, int hourOfDay, long sampleCount, BigDecimal medianBikeCount, BigDecimal stockoutRate) { }
    public record Stockout(long episodeCount, BigDecimal medianDurationMinutes, BigDecimal p90DurationMinutes, BigDecimal medianRecoveryMinutesToThree) { }
    public record Parsed(boolean valid, boolean partialInvalid, Map<CellKey, Cell> cells, Stockout stockout) {
        static Parsed invalid() { return new Parsed(false, false, Map.of(), null); }
    }
}
