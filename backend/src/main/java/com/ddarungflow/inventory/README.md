# Inventory Mapper (재고 데이터 변환)

서울시 따릉이 외부 재고 1건을 서비스 내부 결과 객체(`InventoryResult`)로 변환하는 순수 Java 도메인 매퍼 모듈입니다.

## 1. 입력 / 출력 흐름

```text
[입력 parameters]
- stationId: 대여소 ID (String)
- availableBikeCount: 이용 가능 자전거 수 (Integer)
- collectedAt: 수집시각 (OffsetDateTime)
- sourceAvailable: 외부 소스 사용 가능 여부 (boolean)
- delayed: 지연 여부 (boolean)
       │
       ▼
InventoryMapper.map(...)
       │
       ▼
[출력 Record]
InventoryResult(
    String stationId,
    Integer availableBikeCount,
    OffsetDateTime collectedAt,
    InventoryStatus status
)
```

---

## 2. 상태 판단 순서 (Priority Flow)

1. **검증 (Validation Exception)**
   - `stationId`가 `null`이거나 공백(`blank`)이면 `IllegalArgumentException` 발생
   - `availableBikeCount`가 음수(`< 0`)이면 `IllegalArgumentException` 발생
2. **`UNAVAILABLE`**: `sourceAvailable`이 `false`인 경우
3. **`MISSING`**: `availableBikeCount` 또는 `collectedAt`이 `null`인 경우
4. **`DELAYED`**: 모든 값이 완벽히 존재하며 `delayed`가 `true`인 경우
5. **`NORMAL`**: 위 조건을 모두 통과한 정상 상태

> 💡 **참고**: 자전거 수 `0`은 누락(`MISSING`)이 아닌 정상적인 `0`대로 취급하며 `NORMAL` 상태를 유지합니다.

---

## 3. Fixture 예시

```java
// 1. NORMAL 상태 (자전거 수 0개 포함)
InventoryResult normalResult = mapper.map("ST-101", 0, OffsetDateTime.now(), true, false);
// -> InventoryResult[stationId=ST-101, availableBikeCount=0, collectedAt=..., status=NORMAL]

// 2. DELAYED 상태
InventoryResult delayedResult = mapper.map("ST-102", 5, OffsetDateTime.now(), true, true);
// -> InventoryResult[stationId=ST-102, availableBikeCount=5, collectedAt=..., status=DELAYED]

// 3. MISSING 상태 (수집시각 누락)
InventoryResult missingResult = mapper.map("ST-103", 3, null, true, false);
// -> InventoryResult[stationId=ST-103, availableBikeCount=3, collectedAt=null, status=MISSING]

// 4. UNAVAILABLE 상태 (외부 소스 장애)
InventoryResult unavailableResult = mapper.map("ST-104", null, null, false, false);
// -> InventoryResult[stationId=ST-104, availableBikeCount=null, collectedAt=null, status=UNAVAILABLE]
```

---

## 4. 실제 API 미연결 범위

- 본 모듈은 Pure Java 매핑/상태 판별 로직만 담당합니다.
- 데이터베이스 저장(JPA/Repository), 외부 서울시 OpenAPI HTTP 통신, RestController API 노출 등 영속성 및 데이터 수집 영역과는 연결되지 않은 순수 1:1 인메모리 매퍼입니다.
