# 예측 대상 시각 및 예측 지평(Horizon) 계산 모듈

## 개요
사용자의 도착 예정시각(`arrivalAt`)과 요청 시점의 기능 기준 시각(`featureAsOf`)을 바탕으로 예측 목표 정시시각, 오프셋 분, horizon 분 및 예측 제공 상태(`PredictionTimeStatus`)를 계산하는 순수 자바 계산 모듈입니다.

## 파일 구성

- `PredictionTimeStatus.java`: 예측 가능 여부를 나타내는 Enum (`NORMAL`, `TOO_SOON`, `UNAVAILABLE`)
- `PredictionTimeResult.java`: 계산 결과를 담는 Record (`predictionTargetAt`, `targetOffsetMinutes`, `horizonMinutes`, `status`)
- `PredictionTimeCalculator.java`: 정시 계산 및 지평 상태 판정 계산기 (Spring 의존성 없는 Pure Java 계산기)
- `PredictionTimeCalculatorTest.java`: 필수 6종 및 추가 경계 테스트 2종

## 계산 및 상태 판정 규칙

1. **목표 정시 계산**: `floorToHour(arrivalAt + 30분)`
   - `arrivalAt`에 30분을 더한 후 정시 단위 절삭 (`truncatedTo(ChronoUnit.HOURS)`)
   - 예: `10:29` -> `+30m` = `10:59` -> `10:00`
   - 예: `10:30` -> `+30m` = `11:00` -> `11:00` (정확히 30분이면 다음 정시 선택)
2. **오프셋 및 지평 계산**:
   - `targetOffsetMinutes` = `predictionTargetAt` - `featureAsOf` (분 단위)
   - `horizonMinutes` = `predictionTargetAt` - `featureAsOf` (분 단위)
3. **상태 판정 (`PredictionTimeStatus`)**:
   - `predictionTargetAt` <= `featureAsOf` (과거 또는 요청 시점 정시 이하): `TOO_SOON`
   - `horizonMinutes`가 `60`, `120`, `180`, `240` 중 하나인 경우: `NORMAL`
   - 그 외 미래 horizon: `UNAVAILABLE`

## 조장 / 후속 작업 담당자 인계 사항

- **Spring 의존성 분리**: `PredictionTimeCalculator`는 Spring 의존성 없이 유닛 테스트가 용이하도록 설계되었습니다. 서비스 계층이나 배치 처리기에서 빈으로 등록하여 사용하거나 직접 인스턴스화하여 호출할 수 있습니다.
- **예외 처리**: `arrivalAt` 또는 `featureAsOf`가 `null`인 경우 `IllegalArgumentException`을 던지므로, Controller/Service 레이어에서 비즈니스 요청 파라미터 검증과 연계하시기 바랍니다.
