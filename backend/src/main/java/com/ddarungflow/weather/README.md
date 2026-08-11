# Weather Package (`com.ddarungflow.weather`)

## 1. 개요
본 패키지는 대여소 도착 예정 시각에 맞춰 적합한 단기 예보 항목을 고르고, 우천 상태 및 예보 데이터의 신뢰성 상태(정상·지연·누락·사용불가)를 결정하는 순수 도메인 모듈입니다.

기상청 API 직접 호출, DB/캐시 연동, Spring 디펜던시 없이 순수 Java 로직으로 구동되며, 고정 Fixture 및 도메인 규칙을 검증할 수 있도록 설계되었습니다.

---

## 2. 입력 및 메서드 시그니처

```java
public WeatherForecastResult select(
    String stationId,
    OffsetDateTime arrivalAt,
    int nx,
    int ny,
    OffsetDateTime collectedAt,
    List<ForecastPoint> latest,
    List<ForecastPoint> previous,
    boolean latestFetchFailed
)
```

`ForecastPoint` record 구조:
- `issuedAt` (발표시각)
- `forecastAt` (예측시각)
- `temperatureC` (기온 °C)
- `precipitationProbabilityPercent` (강수확률 %)
- `ptyCode` (강수형태 코드)
- `skyCode` (하늘상태 코드)

---

## 3. 상태 구분 규칙 (`WeatherStatus`)

| 상태 | 설명 |
| :--- | :--- |
| `NORMAL` | 최신 예보 호출이 성공하였으며, 목표 시간의 필수 예보 값(기온, 강수확률, 강수형태, 하늘상태)이 모두 존재하는 경우 |
| `DELAYED` | 최신 예보 수집이 실패했으나, 직전 성공한 수집 배치에서 목표 시간의 완전한 예보 값을 대체 사용할 수 있는 경우 |
| `MISSING` | 예보 배치는 존재하나 목표 시간에 해당하는 항목이 없거나, 필수 필드(기온/강수확률/강수형태/하늘상태 중 하나 이상)가 누락된 경우 |
| `UNAVAILABLE` | 최신 및 직전 수집 데이터가 모두 없거나 사용할 수 있는 대안 예보 데이터가 전혀 없는 경우 |

---

## 4. 도착시각 보정 및 우천 상태 판정 규칙

1. **시간 보정 (`forecastAt`)**:
   - `arrivalAt.plusMinutes(30).truncatedTo(ChronoUnit.HOURS)` 기준 적용.
   - 예: `16:29:59` -> `16:00:00`
   - 예: `16:30:00` -> `17:00:00`
   - 예: `23:30:00` -> 다음 날 `00:00:00`

2. **우천 안내 여부 (`isRainy`)**:
   - 강수확률 $\ge$ 50% **또는** 강수형태(`ptyCode`)가 우천/강수(1: 비, 2: 비/눈, 3: 눈, 4: 소나기)인 경우 `true`.
   - 그 외(PTY 0: 없음 등)는 `false`.

4. **시간대(UTC Offset) 및 필수 입력 검증**:
   - `arrivalAt`은 `null`일 수 없으며 시간대 Offset이 **`+09:00` (KST)** 이어야 합니다.
   - `collectedAt`이 전달되는 경우 시간대 Offset이 **`+09:00` (KST)** 이어야 합니다.
   - `stationId`는 `null`이거나 공백일 수 없으며 위반 시 조용히 넘기지 않고 `IllegalArgumentException`을 발생시켜 명확히 차단합니다.

## 5. 실행 및 테스트 명령

`backend` 디렉터리에서 아래 명령어로 단위 테스트를 실행합니다.

```bash
./gradlew test --tests "com.ddarungflow.weather.*"
```

---

## 6. 테스트 밖 대표 Fixture 직접 실행 결과 기록

> **확인 환경:** `fixture` (실제 기상청 API 미연결 인메모리 실행 환경)

| 항목 | 직접 실행 데이터 및 결과 |
| :--- | :--- |
| **실행 명령** | `javac -encoding UTF-8 -d bin -cp "backend/src/main/java" MainFixtureRunner.java && java -cp "bin;backend/src/main/java" com.ddarungflow.weather.MainFixtureRunner` |
| **도착 예정시각** | `2026-08-11T17:15:00+09:00` |
| **nx / ny** | `60` / `127` |
| **수집시각** | `2026-08-11T14:05:00+09:00` |
| **latest 입력** | `[ForecastPoint(issuedAt=14:00, forecastAt=17:00, temp=26.5, pop=50, pty=1, sky="3"), ForecastPoint(issuedAt=14:00, forecastAt=19:00, temp=24.0, pop=20, pty=0, sky="1")]` |
| **previous 입력** | `[]` (빈 리스트) |
| **latestFetchFailed** | `false` |
| **선택된 forecastAt** | `2026-08-11T17:00:00+09:00` |
| **상태** | `NORMAL` |
| **우천 안내 결과** | `true` |
| **hourlyForecasts** | `[17:00 (26.5°C, POP 50%, PTY 1, SKY "3"), 19:00 (24.0°C, POP 20%, PTY 0, SKY "1")]` |

---

## 7. Notion 제출용 최종 정제 및 증거 요약

> **⚠️ 확인 환경 명시:**
> 본 보고서의 모든 결과는 **Fixture 기반 인메모리 테스트 및 순수 Java 직접 실행 환경**에서 수집되었습니다.
> `Controller`, `prediction API`, `MockMvc` 및 로컬 Postman 실제 HTTP 통신을 통한 200 OK 실행 결과는 포함되어 있지 않으며, 조장 후속 작업을 통해 연동될 예정입니다.

### 파일별 구현 내용
- `WeatherStatus.java`: 예보 신뢰성 상태 Enum (`NORMAL`, `DELAYED`, `MISSING`, `UNAVAILABLE`).
- `WeatherForecastResult.java`: 선택된 단기 예보 항목과 우천 여부(`isRainy`) 및 시간별 목록을 담는 Record DTO.
- `WeatherForecastSelector.java`: 30분 정시 보정, 완결성 검사(TMP, POP, PTY, SKY), PTY 1~4 및 POP $\ge 50\%$ 우천 판정, arrivalAt 날짜 필터링 및 오름차순 정렬 도메인 Selector logic.
- `WeatherForecastSelectorTest.java`: 시각 반올림, POP 49/50 경계, PTY 0~4, SKY 누락(`MISSING`), UTC offset 예외 차단, 도착일 필터링 JUnit5 단위 테스트.
- `README.md`: 도메인 규칙 및 스탠드얼론 Fixture 직접 실행 결과 가이드 문서.

### 담당자가 추가한 테스트
- `testArrivalAtRounding()`: 16:29 $\rightarrow$ 16:00, 16:30 $\rightarrow$ 17:00, 23:30 $\rightarrow$ 다음날 00:00 시각 반올림 검증.
- `testNormalStatus()`: 완결된 최신 예보 존재 시 `NORMAL` 상태 검증.
- `testPopRainyBoundary()`: POP 49% (false) vs POP 50% (true) 우천 경계값 검증.
- `testPtyRainyConditions()`: PTY 0(false), PTY 1~4(true: 비, 비/눈, 눈, 소나기) 강수형태 검증.
- `testDelayedStatusWhenLatestFetchFailed()`: 최신 실패 시 직전 완전값 사용 및 `DELAYED` 반환 검증.
- `testMissingStatusWhenFieldIsNull()`: TMP, POP, PTY, SKY 필드 누락 시 `MISSING` 반환 검증.
- `testUnavailableStatusWhenNoDataAvailable()`: 대체 예보 미존재 시 `UNAVAILABLE` 반환 검증.
- `testHourlyForecastsFilteredByArrivalDate()`: 전날/다음날 예보 제외 및 도착일 예보만 오름차순 정렬 포함 검증.
- `testInvalidInputs()`: arrivalAt null, stationId 누락/공백, UTC offset mismatch 시 `IllegalArgumentException` 차단 검증.

### 테스트·컴파일·직접 실행 결과
- **단위 테스트**: `./gradlew test --tests "com.ddarungflow.weather.*"` $\rightarrow$ **`BUILD SUCCESSFUL` (총 9개 테스트 통과)**
- **스탠드얼론 Fixture 직접 실행**:
  - 실행 명령: `javac -encoding UTF-8 -d bin -cp "backend/src/main/java" MainFixtureRunner.java && java -cp "bin;backend/src/main/java" com.ddarungflow.weather.MainFixtureRunner`
  - 도착 예정시각: `2026-08-11T17:15:00+09:00`
  - nx / ny: `60` / `127`
  - 수집시각: `2026-08-11T14:05:00+09:00`
  - latest 입력: `17시 예보 (temp=26.5, pop=50, pty=1, sky="3")`, `19시 예보 (temp=24.0, pop=20, pty=0, sky="1")`
  - previous 입력: `[]`
  - latestFetchFailed: `false`
  - 선택된 forecastAt: `2026-08-11T17:00:00+09:00`
  - 상태: `NORMAL`
  - 우천 안내 결과: `true`
  - hourlyForecasts: 2건 (`17:00`, `19:00`)
  - **확인 환경**: `fixture` (실제 기상청 API 미호출)

### 계약과 다른 점
- **이탈 내역 없음**: 작업서 지정 `WeatherForecastSelector` 시그니처 및 `ForecastPoint` record 필드명과 정확히 일치.

### 막힌 내용
- 작업 제약상 Controller, Security, DB 수정이 금지되어 있어 실제 HTTP Postman 통신 테스트는 진행하지 못하고 도메인 DTO 직렬화 계약으로 검증함.

### 조장에게 요청할 후속 작업
1. 기상청 단기예보 API 수집 파이프라인 연동.
2. `PredictionController` / Service 응답 최상위 `weather` 속성에 `WeatherForecastResult` 결합.
3. 통합 엔드포인트 MockMvc 및 Postman HTTP 실제 `200 OK` 응답 테스트.
