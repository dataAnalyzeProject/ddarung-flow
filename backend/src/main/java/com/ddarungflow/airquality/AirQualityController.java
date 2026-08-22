package com.ddarungflow.airquality;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stations")
public class AirQualityController {

    private final AirQualityService airQualityService;

    public AirQualityController(AirQualityService airQualityService) {
        this.airQualityService = airQualityService;
    }

    @Operation(
            summary = "대여소 도착지 대기질 조회",
            security = @SecurityRequirement(name = "sessionCookie")
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "대기질 조회 결과",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = AirQualityResponse.class))),
            @ApiResponse(responseCode = "401", description = "인증 필요", content = @Content),
            @ApiResponse(responseCode = "404", description = "존재하지 않거나 비활성인 대여소", content = @Content)
    })
    @GetMapping("/{stationId}/air-quality")
    public ResponseEntity<AirQualityResponse> getAirQuality(@PathVariable("stationId") String stationId) {
        return airQualityService.getAirQuality(stationId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
