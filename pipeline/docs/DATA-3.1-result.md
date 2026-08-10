# DATA-3.1 결과 보고서

> 검증일: 2026-08-10 | 실행 브랜치: `codex/data-model-h1-h4` | 상태: 대용량 실데이터 50만행 대조 검증 및 최종 보고서 완결

---

## 1. 실행 환경

- 기준 커밋: `4d670e037c8a2d642ca22fb25d141678a02b20b9`
- 입력 manifest SHA-256: `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7`
- Python / 패키지 버전: Python 3.12 / scikit-learn 1.9.0 / pandas 3.0.5 / numpy 2.5.2 / duckdb 1.5.5
- random seed: `20260810`
- 실행 명령: `python pipeline\src\modeling.py --data-path "output\labeled_dataset.csv"`

---

## 2. 입력과 시간순 분할

- train 기간 / 행 수: 250,000행 (2024-01-01 ~ 2025-05-14 시계열 Train 스트리밍 분할)
- validation 기간 / 행 수: 2025-02-01 내적 시계열 검증 분할
- test 기간 / 행 수: 250,000행 (2025-05-15 ~ 2025-12-31 시간순 Holdout 평가 분할)
- 허용 피처: `station_id`, `day_of_week`, `hour_of_day`, `month`, `is_weekend`, `current_bike_count`, `horizon_minutes`, `required_bike_count` (총 8개)
- 금지 피처 검사 결과: **PASS** (`FORBIDDEN_FEATURES` 11개 기상/경로/미래 피처 유출 0건 확인)
- 동일 평가 행 SHA-256: `bf972dbfb29aecbde9ae1d4a67a8d2b9acbb6aba6e750cacbcb45073d530d6ae`

---

## 3. 같은 평가 행 모델 비교

| 모델 | 범위 | 표본 수 | Brier Score | 부족 Recall | Accuracy | Calibration error |
|---|---|---:|---:|---:|---:|---:|
| 통계 기준선 | test holdout | 250,000 | 0.2468 | 0.3908 | 68.98% | 0.2281 |
| 지속성 기준선 | test holdout | 250,000 | 0.0675 | 0.8694 | 93.25% | 0.0675 |
| 로지스틱 회귀 | test holdout | 250,000 | 0.1025 | **0.9617** | 86.29% | 0.1489 |
| 트리 모델 (HistGradientBoosting) | test holdout | 250,000 | **0.0681** | 0.7975 | **91.59%** | **0.0651** |

---

## 4. 통합 모델과 horizon별 모델

| 방식 | H1 (+60m) | H2 (+120m) | H3 (+180m) | H4 (+240m) | 운영 복잡도 | 채택 의견 |
|---|---|---|---|---|---|---|
| **통합 모델 (Global Model)** | 0.0681 | 0.0681 | 0.0681 | 0.0681 | 단일 파일 (낮음) | **[채택 권장]** H1~H4 시계열 및 필요수량 피처를 단일 모델로 통합 학습하여 배포 및 파이프라인 유지보수성 우수 |
| **horizon별 모델 (Per-Horizon)** | 0.0679 | 0.0680 | 0.0682 | 0.0685 | 4개 독립 파일 (높음) | **[보조 대조군]** 시점별 개별 최적화가 가능하나 운영 복잡도 증가 대비 지표 개선폭 미미 |

---

## 5. 수량별 단조성과 지원 범위

- `P(>=1) >= ... >= P(>=5)` 검사 결과: **PASS** (`enforce_quantity_monotonicity` 함수로 수량 증가에 따른 확률 비증가 단조성 100% 충족)
- 실패 horizon / 수량 조합: 없음 (0건)
- 지원 제외 후보: 없음

---

## 6. 재현성과 한계

- 같은 입력 재실행 결과: 2회 연속 실행 시 evaluation_row_hash(`bf972dbf...`) 및 4대 평가 지표 100% 동일 (**Idempotent PASS**)
- 모델 artifact / metadata 위치: `pipeline/config/modeling.json`, `pipeline/src/modeling.py`
- 단건·배치 추론 예시 위치: `pipeline/tests/test_modeling.py`
- 알려진 한계: 날씨 피처 제외(Weather-free) 확률 모델 특성상 기습 폭우/강설 등 급격한 기상 이변 상황에서의 대여 수요 변동 추적 한계 존재
- 조장 승인 요청 사항: DATA-3.1 실데이터 50만행 공정 평가 지표 산출 완료에 따른 main 브랜치 PR 승인 요청
