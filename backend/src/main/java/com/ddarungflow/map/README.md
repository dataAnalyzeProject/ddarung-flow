# Map & Prediction Domain Specification

`com.ddarungflow.map` 패키지는 지도 표시, 장소·대여소 검색, 목적지 후보 선정 및 경로·예측 결과 조립을 담당하는 전용 도메인 모듈입니다.

## 1. 처리 흐름 (Processing Flow)

```text
[HTTP 요청]
  ├── GET /api/v1/stations (?minLat&maxLat&minLng&maxLng) -> StationQueryService -> DB Active Stations + Inventory
  ├── GET /api/v1/stations/search (?query) -> StationQueryService (2~50자 검증, Limit 10)
  ├── GET /api/v1/stations/{stationId} -> StationQueryService
  ├── GET /api/v1/places/search (?query) -> KakaoMapClient (Fake/Real Wrapper)
  ├── POST /api/v1/routes/candidates -> RouteCandidateService (500m -> 1km 확대 -> Max 5) -> MapPredictionService
  ├── POST /api/v1/predictions/route -> MapPredictionService (후보 + 재고 + ML 예측 조립)
  └── POST /api/v1/predictions/direct -> MapPredictionService (지정 stationId #1 유지 + 주변 후보 중복제거)
```

## 2. Fixture 및 예시 (Fixtures & Examples)

- **Station Fixture**: `ST-4` (망원역 1번출구 앞, lat: 37.5556488, lng: 126.91062927)
- **Inventory Current Fixture**: `ST-4` -> `availableBikeCount: 11`, `status: NORMAL`
- **Route Candidates Output**:
```json
[
  {
    "stationId": "ST-4",
    "stationName": "102. 망원역 1번출구 앞",
    "latitude": 37.5556488,
    "longitude": 126.91062927,
    "distanceMeters": 0,
    "durationSeconds": 0,
    "availableBikeCount": 11,
    "inventoryStatus": "NORMAL",
    "predictionProbability": 0.92,
    "predictionTargetAt": "2026-08-12T15:30:00+09:00"
  }
]
```

## 3. 미통합 범위 (Unintegrated Scope)

- **운영 DB/스케줄러 갱신**: 서울시 실시간 OpenAPI 주기적 수집 및 DB `station_inventory_current` 테이블 자동 갱신 스케줄러는 본 작업 범위에 포함되지 않으며 조장 후속 작업입니다.
- **실제 API Key 및 보안**: Kakao REST Key 및 서울시 OpenAPI Key의 실제 프로덕션 injection, `.env` 분리, 프론트엔드 Map SDK 연동은 `INT-4.1` 통합 단계에서 진행됩니다.
- **`availabilityLevel`**: 본 결과에서는 `availabilityLevel`을 추정하여 반환하지 않습니다 (조장 통합 시 처리).

## 4. 검증 명령어 (Verification Commands)

```bash
cd backend
.\gradlew.bat test --tests "com.ddarungflow.map.*" --rerun-tasks --no-daemon
.\gradlew.bat test --rerun-tasks --no-daemon
```
