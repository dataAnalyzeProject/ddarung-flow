package com.ddarungflow.controller;

import com.ddarungflow.map.MapApiDtos;
import com.ddarungflow.map.KakaoMapClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/places")
public class PlaceController {

    private final KakaoMapClient kakaoMapClient;

    @org.springframework.beans.factory.annotation.Autowired
    public PlaceController(KakaoMapClient kakaoMapClient) {
        this.kakaoMapClient = kakaoMapClient;
    }

    @GetMapping("/search")
    public ResponseEntity<?> searchPlaces(
        @RequestParam(name = "query", required = false, defaultValue = "") String query,
        @RequestParam(name = "page", required = false, defaultValue = "1") int page,
        @RequestParam(name = "size", required = false, defaultValue = "10") int size
    ) {
        String trimmedQuery = query == null ? "" : query.trim();
        if (trimmedQuery.length() < 2 || trimmedQuery.length() > 50 || page < 1 || size < 1 || size > 15) {
            return ResponseEntity.badRequest().build();
        }
        try {
            return ResponseEntity.ok(kakaoMapClient.searchPlaces(trimmedQuery, page, size));
        } catch (KakaoMapClient.ProviderException e) {
            return ResponseEntity.status(502).body(
                new MapApiDtos.ProviderErrorResponseDto("PLACE_PROVIDER_ERROR", "장소 검색 제공자를 사용할 수 없습니다.")
            );
        }
    }
}
