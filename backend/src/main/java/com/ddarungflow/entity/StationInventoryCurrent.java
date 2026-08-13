package com.ddarungflow.entity;

import com.ddarungflow.inventory.InventoryStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "station_inventory_current")
public class StationInventoryCurrent {

    @Id
    @Column(name = "station_id", nullable = false, length = 50)
    private String stationId;

    @Column(name = "available_bike_count")
    private Integer availableBikeCount;

    @Column(name = "collected_at")
    private OffsetDateTime collectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "inventory_status", nullable = false, length = 20)
    private InventoryStatus inventoryStatus;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public StationInventoryCurrent() {}

    public StationInventoryCurrent(String stationId, Integer availableBikeCount, OffsetDateTime collectedAt, InventoryStatus inventoryStatus) {
        this.stationId = stationId;
        this.availableBikeCount = availableBikeCount;
        this.collectedAt = collectedAt;
        this.inventoryStatus = inventoryStatus;
        this.updatedAt = OffsetDateTime.now();
    }

    public String getStationId() { return stationId; }
    public void setStationId(String stationId) { this.stationId = stationId; }

    public Integer getAvailableBikeCount() { return availableBikeCount; }
    public void setAvailableBikeCount(Integer availableBikeCount) { this.availableBikeCount = availableBikeCount; }

    public OffsetDateTime getCollectedAt() { return collectedAt; }
    public void setCollectedAt(OffsetDateTime collectedAt) { this.collectedAt = collectedAt; }

    public InventoryStatus getInventoryStatus() { return inventoryStatus; }
    public void setInventoryStatus(InventoryStatus inventoryStatus) { this.inventoryStatus = inventoryStatus; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
