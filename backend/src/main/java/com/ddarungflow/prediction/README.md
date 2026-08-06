# Prediction Time Calculator (예측 시간 계산기)

따릉이 흐름 및 수요 예측 서비스(`ddarungflow`)에서 예측을 요청할 수 있는 시간의 유효성을 정시(정각) 및 Horizon 검증 규칙에 맞춰 처리하는 핵심 비즈니스 도메인 모듈입니다.

---

## 1. 비즈니스 규칙 (Business Rules)

1. **입력 파라미터**
   - `requestedAt` (OffsetDateTime): 예측을 요청한 시간
   - `arrivalAt` (OffsetDateTime): 도착 예정 시각
   - `featureAsOf` (OffsetDateTime): 예측 피처(데이터) 기준 시각

2. **목표 시각 계산 (predictionTargetAt)**
   - 도착 시각 기준 30분을 더한 뒤, 정시(정각) 단위로 잘라내어 목표 시각을 계산합니다.
   - 공식: `predictionTargetAt = truncatedToHours(arrivalAt + 30 minutes)`
     - 예: 도착 `15:29` ➔ `15:29 + 30분 = 15:59` ➔ 목표 시각 `15:00`
     - 예: 도착 `15:30` ➔ `15:30 + 30분 = 16:00` ➔ 목표 시각 `16:00`
     - 예: 도착 `15:41` ➔ `15:41 + 30분 = 16:11` ➔ 목표 시각 `16:00`

3. **시간 간격 계산**
   - **`targetOffsetMinutes`**: 도착 예정 시각(`arrivalAt`)에서 목표 시각(`predictionTargetAt`)까지의 분 차이
   - **`horizonMinutes`**: 피처 기준 시각(`featureAsOf`)에서 목표 시각(`predictionTargetAt`)까지의 분 차이

4. **예측 시간 상태 검증 (PredictionTimeStatus)**
   - **`TOO_SOON`** (예측 불가 - 너무 이름):
     - 계산된 목표 시각(`predictionTargetAt`)이 요청 시각(`requestedAt`)과 같거나 이전 시점인 경우.
   - **`NORMAL`** (예측 가능 - 정상):
     - 미래 목표 시각이면서, `horizonMinutes`가 정확히 **60, 120, 180, 240** 분 중 하나인 경우.
   - **`UNAVAILABLE`** (예측 불가 - 지원하지 않는 예측 범위):
     - 미래 목표 시각이지만, `horizonMinutes`가 위의 60, 120, 180, 240분 외의 값인 경우 (예: 300분 등).

---

## 2. 모듈 구성 요소

- [`PredictionTimeStatus.java`](PredictionTimeStatus.java): 예측 시간 상태 Enum (`NORMAL`, `TOO_SOON`, `UNAVAILABLE`).
- [`PredictionTimeResult.java`](PredictionTimeResult.java): 계산 및 검증 결과 Record (`predictionTargetAt`, `targetOffsetMinutes`, `horizonMinutes`, `status`).
- [`PredictionTimeCalculator.java`](PredictionTimeCalculator.java): 순수 Java로 작성된 핵심 도메인 계산 엔진 (Spring 등 프레임워크 의존성 전무, `public final class`).
- [`PredictionTimeCalculatorTest.java`](../../../../test/java/com/ddarungflow/prediction/PredictionTimeCalculatorTest.java): JUnit 5 기반 단위 테스트 코드.

---

## 3. 조장 인계 기록 (Handoff Notes)

### 📌 설계 주안점
- **순수 시간 및 오프셋 연산**: 서로 다른 타임존(UTC offset)에서 입력된 시각 데이터 간의 시간 차이 및 동시성 판단을 안전하게 계산하기 위해 `OffsetDateTime`과 `Duration` 연산을 활용했습니다.
- **불변 데이터 캡슐화**: `PredictionTimeResult`는 수정 불가능한 레코드 구조로 캡슐화되어 데이터 무결성을 보장합니다.
- **인스턴스화 방지**: `PredictionTimeCalculator`는 유틸리티 클래스로서의 의도에 맞게 `final class`로 선언하고 `private` 생성자를 적용하여 인스턴스화를 방지했습니다.

### 🧪 테스트 가이드
- 이 프로젝트는 Gradle 기반으로 빌드됩니다. 다음 명령어로 전체 단위 테스트를 구동할 수 있습니다.
  ```powershell
  ./gradlew test
  ```
