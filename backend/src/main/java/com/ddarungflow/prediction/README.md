# Prediction Time Package

## 개요
사용자의 도착 예정 시각(`arrivalAt`), 요청 시각(`requestedAt`), 피처 산출 시각(`featureAsOf`)을 기반으로 목표 예측 정시(`predictionTargetAt`), 오프셋(`targetOffsetMinutes`), Horizon(`horizonMinutes`), 및 예측 가능 상태(`status`)를 산출합니다.

## 용어 및 공식 정의
- `predictionTargetAt`: `arrivalAt`에 30분을 더한 후 정시(Hour) 단위로 절삭한 시각입니다.
- `targetOffsetMinutes`: `predictionTargetAt` - `arrivalAt` (도착 예정 시각부터 목표 정시 시각까지의 분 차이)
- `horizonMinutes`: `predictionTargetAt` - `featureAsOf` (피처 기준 시각부터 목표 정시 시각까지의 분 차이)

## 예측 가능 상태 (Status) 판정 규칙
1. **TOO_SOON**: `predictionTargetAt`이 `requestedAt`보다 늦지 않을 때 (목표 정시 시각이 요청 발생 시각 이하인 경우)
2. **NORMAL**: 미래 horizon 분이 60, 120, 180, 240분 중 하나인 경우
3. **UNAVAILABLE**: 그 외의 미래 horizon인 경우
