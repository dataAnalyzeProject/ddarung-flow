package com.ddarungflow.airquality;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AirKoreaProperties {

    private final String baseUrl;
    private final String serviceKey;
    private final int catalogNumOfRows;

    public AirKoreaProperties(
            @Value("${airkorea.base-url:https://apis.data.go.kr/B552584}") String baseUrl,
            @Value("${AIRKOREA_SERVICE_KEY:}") String serviceKey,
            @Value("${airkorea.catalog-num-of-rows:1000}") int catalogNumOfRows
    ) {
        this.baseUrl = baseUrl;
        this.serviceKey = serviceKey;
        this.catalogNumOfRows = catalogNumOfRows;
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String serviceKey() {
        return serviceKey;
    }

    public int catalogNumOfRows() {
        return catalogNumOfRows;
    }
}
