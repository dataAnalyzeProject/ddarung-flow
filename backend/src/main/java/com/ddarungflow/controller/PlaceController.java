package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.KakaoMapClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/places")
public class PlaceController {

    private final KakaoMapClient kakaoMapClient;

    public PlaceController() {
        this(new KakaoMapClient("https://dapi.kakao.com", "fake-key"));
    }

    public PlaceController(KakaoMapClient kakaoMapClient) {
        this.kakaoMapClient = kakaoMapClient != null ? kakaoMapClient : new KakaoMapClient("https://dapi.kakao.com", "fake-key");
    }

    @GetMapping("/search")
    public ResponseEntity<List<MapApiDtos.PlaceSearchResponseDto>> searchPlaces(
        @RequestParam(name = "query", required = false, defaultValue = "") String query
    ) {
        List<MapApiDtos.PlaceSearchResponseDto> results = kakaoMapClient.searchPlaces(query);
        return ResponseEntity.ok(results);
    }
}
