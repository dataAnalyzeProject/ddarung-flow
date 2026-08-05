# 🧪 PredictionTimeCalculatorTest 테스트 실행 및 검증 보고서

- **실행 일시**: 2026-08-05 10:36:34 KST
- **대상 클래스**: `com.ddarungflow.prediction.PredictionTimeCalculatorTest`
- **테스트 환경**: Java 21 / JUnit 5 / AssertJ / Gradle
- **전체 실행 결과**: **PASSED (총 8개 테스트 통과 / 0개 실패 / 0개 스킵)**

---

## 📊 테스트 케이스 요약표

| 번호 | 구분 | 테스트 명칭 | 실행 시간 | 결과 |
|:---:|:---:|:---|:---:|:---:|
| 1 | 필수 | `testFloorToHourPlus30Minutes` <br> (floorToHour(arrivalAt + 30분) 정시 계산 및 정확히 30분이면 다음 정시 선택) | 0.001s | `PASSED` |
| 2 | 필수 | `testTargetOffsetMinutesCalculation` <br> (arrivalAt부터 target까지 targetOffsetMinutes 계산 검증) | 0.000s | `PASSED` |
| 3 | 필수 | `testTooSoonStatus` <br> (목표 정시가 요청시각보다 과거이거나 같으면 TOO_SOON) | 0.001s | `PASSED` |
| 4 | 필수 | `testHorizonMinutesCalculation` <br> (featureAsOf부터 target까지 horizonMinutes 계산 검증) | 0.001s | `PASSED` |
| 5 | 필수 | `testNormalStatusForValidHorizons` <br> (60, 120, 180, 240 horizon은 NORMAL 반환) | 0.046s | `PASSED` |
| 6 | 필수 | `testUnavailableStatusForOtherHorizons` <br> (60·120·180·240 이외의 미래 horizon은 UNAVAILABLE 반환 및 반올림 안 함) | 0.000s | `PASSED` |
| 7 | 추가 | `testNullAndOffsetMismatchHandling` <br> (Null 인자 및 UTC offset 불일치 검사 예외 검증) | 0.002s | `PASSED` |
| 8 | 추가 | `testMidnightBoundaryCalculation` <br> (자정이 넘어가는 경계시각(23:45) 계산 검증) | 0.001s | `PASSED` |

---

## 📄 Gradle XML Report 스캔 데이터 (원본 데이터)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.ddarungflow.prediction.PredictionTimeCalculatorTest" tests="8" skipped="0" failures="0" errors="0" timestamp="2026-08-05T01:36:33.781Z" hostname="DESKTOP-5QVSUQT" time="0.054">
  <properties/>
  <testcase name="필수 테스트 5: 60, 120, 180, 240 horizon은 NORMAL 반환" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.046"/>
  <testcase name="필수 테스트 1: floorToHour(arrivalAt + 30분) 정시 계산 및 정확히 30분이면 다음 정시 선택" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.001"/>
  <testcase name="담당자 추가 테스트 2: 자정이 넘어가는 경계시각(23:45) 계산 검증" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.001"/>
  <testcase name="담당자 추가 테스트 1: Null 인자 및 UTC offset 불일치 검사 예외 검증" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.002"/>
  <testcase name="필수 테스트 4: featureAsOf부터 target까지 horizonMinutes 계산 검증" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.001"/>
  <testcase name="필수 테스트 6: 60·120·180·240 이외의 미래 horizon은 UNAVAILABLE 반환 및 반올림 안 함" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.0"/>
  <testcase name="필수 테스트 2: arrivalAt부터 target까지 targetOffsetMinutes 계산 검증" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.0"/>
  <testcase name="필수 테스트 3: 목표 정시가 요청시각보다 과거이거나 같으면 TOO_SOON" classname="com.ddarungflow.prediction.PredictionTimeCalculatorTest" time="0.001"/>
  <system-out><![CDATA[]]></system-out>
  <system-err><![CDATA[]]></system-err>
</testsuite>
```
