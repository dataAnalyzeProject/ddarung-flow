package com.ddarungflow.admin;

import com.ddarungflow.dto.AdminDataQualityDtos;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AdminDataQualityService {
    private final StationRepository stations;
    private final StationInventoryCurrentRepository inventory;

    public AdminDataQualityService(StationRepository stations, StationInventoryCurrentRepository inventory) {
        this.stations = stations;
        this.inventory = inventory;
    }

    public AdminDataQualityDtos.Response dataQuality(OffsetDateTime now) {
        Set<String> activeStationIds = stations.findByActiveTrue().stream().map(station -> station.getStationId()).collect(Collectors.toSet());
        var current = inventory.findAll().stream().filter(row -> activeStationIds.contains(row.getStationId())).toList();
        Map<InventoryStatus, Long> breakdown = new EnumMap<>(InventoryStatus.class);
        for (InventoryStatus status : InventoryStatus.values()) breakdown.put(status, 0L);
        current.forEach(row -> breakdown.compute(row.getInventoryStatus(), (status, count) -> count + 1));

        var collectedRows = current.stream().filter(row -> row.getCollectedAt() != null).toList();
        OffsetDateTime latestCollectedAt = collectedRows.stream().map(StationInventoryCurrent::getCollectedAt).max(OffsetDateTime::compareTo).orElse(null);
        var delays = collectedRows.stream().map(row -> Math.max(0, Duration.between(row.getCollectedAt(), now).toMinutes())).sorted().toList();
        Long p50 = percentile(delays, 0.50);
        Long p95 = percentile(delays, 0.95);
        String freshnessStatus = p95 == null || p95 > 180 ? "MISSING" : p95 > 30 ? "DELAYED" : "NORMAL";

        long expected = activeStationIds.size();
        long latest = current.size();
        Map<String, Long> namedBreakdown = breakdown.entrySet().stream().collect(Collectors.toMap(entry -> entry.getKey().name(), Map.Entry::getValue));
        return new AdminDataQualityDtos.Response(
                new AdminDataQualityDtos.Collection(24, expected, latest, Math.max(0, expected - latest), latestCollectedAt),
                new AdminDataQualityDtos.Freshness(p50, p95, freshnessStatus), namedBreakdown, now);
    }

    private Long percentile(java.util.List<Long> values, double percentile) {
        if (values.isEmpty()) return null;
        return values.get((int) Math.ceil(values.size() * percentile) - 1);
    }
}
