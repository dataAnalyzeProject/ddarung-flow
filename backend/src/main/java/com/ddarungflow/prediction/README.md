# Prediction Time Calculator (예측 시간 계산기)

따릉이 흐름 및 수요 예측 서비스(`ddarungflow`)에서 예측을 요청할 수 있는 시간의 유효성을 검증하고 보정하는 모듈입니다.

---

## 1. 비즈니스 규칙 (Business Rules)

1. **시간 보정 (Rounding)**
   - 예측 데이터 파이프라인의 주기성(10분 단위 배치)에 맞춰, 요청된 시간(`requestedTime`)을 가장 가까운 **10분 단위**로 반올림하여 보정합니다.
     - 예: `11:23:45` ➔ `11:20:00`
     - 예: `11:27:12` ➔ `11:30:00`
     - 예: `11:58:00` ➔ `12:00:00`

2. **예측 시간 상태 검증 (PredictionTimeStatus)**
   - **`TOO_SOON`** (예측 불가 - 너무 이름/과거):
     - 보정된 예측 시간이 현재 시간(`currentTime`)보다 과거인 경우.
     - 현재 시간과 보정된 예측 시간의 차이(Lead Time)가 **10분 미만**인 경우 (실시간 예측 준비 시간 부족).
   - **`UNAVAILABLE`** (예측 불가 - 범위 초과):
     - 보정된 예측 시간이 현재 시간 기준 **24시간**을 초과하는 미래인 경우 (신뢰성 있는 예측 데이터는 최대 24시간 범위 내에서만 제공).
   - **`NORMAL`** (예측 가능 - 정상):
     - 보정된 예측 시간이 현재 시간 기준 **10분 이상 ~ 24시간 이하**의 범위 내에 존재할 경우.

---

## 2. 모듈 구성 요소

- [`PredictionTimeStatus.java`](PredictionTimeStatus.java): 예측 시간의 상태를 정의하는 Enum (`NORMAL`, `TOO_SOON`, `UNAVAILABLE`).
- [`PredictionTimeResult.java`](PredictionTimeResult.java): 요청 시간, 보정 시간, 최종 상태 및 설명 메시지를 담는 Record.
- [`PredictionTimeCalculator.java`](PredictionTimeCalculator.java): 순수 Java로 작성된 핵심 계산 엔진 (Spring 등 프레임워크 의존성 배제).
- [`PredictionTimeCalculatorTest.java`](../../../../test/java/com/ddarungflow/prediction/PredictionTimeCalculatorTest.java): 단위 테스트 코드 (JUnit 5 기반).

---

## 3. 조장 인계 기록 (Handoff Notes)

### 📌 설계 주안점
- **의존성 배제**: 해당 모듈은 유틸리티 성격의 도메인 로직이므로 Spring 프레임워크나 외부 라이브러리 어노테이션에 의존하지 않도록 순수 자바(POJO/Record)로 설계했습니다. 향후 다른 모듈이나 배치 서버(Batch Server) 등으로 이관할 때 매우 용이합니다.
- **Java 21 Record 사용**: 불변 객체(Immutable)를 직관적으로 정의하기 위해 Java 16+ `record`를 사용하여 코드 가독성과 데이터 안정성을 높였습니다.
- **예외 처리**: `currentTime` 또는 `requestedTime`이 `null`로 입력될 경우 즉시 `IllegalArgumentException`을 발생시켜 안전성을 도모했습니다.

### 🧪 테스트 확인법
- JUnit 5 라이브러리를 클래스패스에 바인딩하여 테스트를 빌드 및 실행할 수 있습니다.
- 10분 경계 조건, 24시간 경계 조건, 반올림 경계 조건 및 null 입력 처리가 완벽히 검증되었습니다.
