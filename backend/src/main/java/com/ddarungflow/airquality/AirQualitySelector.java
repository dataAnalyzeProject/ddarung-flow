package com.ddarungflow.airquality;

import java.time.OffsetDateTime;
import java.util.List;

public class AirQualitySelector {

    public AirQualityResult selectFromJson(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            String latestJsonFixture,
            String previousJsonFixture,
            boolean latestFetchFailed
    ) {
        return AirQualityMapper.mapFromJson(
                stationName,
                targetTime,
                collectedAt,
                latestJsonFixture,
                previousJsonFixture,
                latestFetchFailed
        );
    }

    public AirQualityResult select(
            String stationName,
            OffsetDateTime targetTime,
            OffsetDateTime collectedAt,
            List<AirKoreaMeasurementPoint> latest,
            List<AirKoreaMeasurementPoint> previous,
            boolean latestFetchFailed
    ) {
        return AirQualityMapper.map(
                stationName,
                targetTime,
                collectedAt,
                latest,
                previous,
                latestFetchFailed
        );
    }
}
