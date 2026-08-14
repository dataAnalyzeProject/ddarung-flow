# AirQuality Package (`com.ddarungflow.airquality`)

## 1. 개요
본 패키지는 AirKorea 대기질 측정 JSON Fixture를 입력받아 화면 API DTO (`AirQualityResult`)를 생성하고, 데이터의 신뢰성 상태(`NORMAL`, `DELAYED`, `MISSING`, `UNAVAILABLE`)를 결정하는 순수 Java 도메인 모듈입니다.

외부 HTTP 호출, DB/캐시 연동, Spring 디펜던시 및 Security, OpenAPI, 환경변수 설정 없이 순수 Java 로직으로 구동되며, 고정 Fixture 및 도메인 규칙을 검증할 수 있도록 설계되었습니다.

---

## 2. 주요 클래스 및 DTO

- `AirQualityStatus`: 상태 구분을 위한 Enum (`NORMAL`, `DELAYED`, `MISSING`, `UNAVAILABLE`)
- `AirKoreaMeasurementPoint`: AirKorea API 개별 측정 지점 데이터 Record
- `AirQualityResult`: 화면 API 반환용 DTO Record
- `AirQualitySelector`: 고정 JSON Fixture 및 Measurement 리스트 파싱 및 상태 판정 Selector

---

## 3. 상태 구분 규칙 (`AirQualityStatus`)

| 상태 | 설명 |
| :--- | :--- |
| `NORMAL` | 최신 대기질 데이터 수집이 성공하였으며, 목표 측정소의 필수 데이터(pm10/pm25 및 등급)가 정상적으로 존재하는 경우 |
| `DELAYED` | 최신 수집이 실패했으나, 직전 성공한 수집 배치에서 목표 측정소의 대계질 데이터를 대체 사용할 수 있는 경우 |
| `MISSING` | 수집 배치는 존재하나 목표 측정소에 해당하는 항목이 없거나, 필수 필드가 누락된 경우 |
| `UNAVAILABLE` | 최신 및 직전 수집 데이터가 모두 없거나 사용할 수 있는 대안 데이터가 전혀 없는 경우 |

---

## 4. 실행 및 테스트 명령

`backend` 디렉터리에서 아래 명령어로 단위 테스트를 실행합니다.

```bash
./gradlew test --tests "com.ddarungflow.airquality.*"
```
