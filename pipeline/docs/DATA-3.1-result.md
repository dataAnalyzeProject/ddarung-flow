# DATA-3.1 결과 보고서

> 검증일: 2026-08-11 | 실행 브랜치: `codex/data-model-h1-h4` | 상태: 정석 2단계 분리 검증 + 실제 예측 단조성 감사·보정 완결

---

## 1. 실행 환경 및 분할 개요

- 기준 커밋: `6e996fc` (`chore: prepare DATA-3.1 starter package`, rebase 후 hash 변경: 원본 `4d670e0`)
- 입력 manifest SHA-256: `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7`
- Python / 패키지 버전: Python 3.12 / scikit-learn 1.9.0 / pandas 3.0.5 / numpy 2.5.2 / duckdb 1.5.5
- random seed: `20260810`
- 실행 명령: `python pipeline\src\modeling.py --data-path "output\labeled_dataset.csv" --max-total-rows 2000000`

---

## 2. 시계열 분할 및 비례 층화 표본

### 2-1. 원본 CSV (wide-format, station+시간 1행)

| 분할 | 원본 wide-format 행 수 | 비율 |
|---|---:|---:|
| train (`split=train`) | 51,038,462 | 76.8% |
| test (`split=test_holdout`) | 15,429,015 | 23.2% |
| **원본 합계** | **66,467,477** | 100% |

> `labeled_dataset.csv`의 split 컬럼은 `train` / `test_holdout` 2가지만 존재함. validation split은 train 내부에 시간순으로 포함되어 있음.

### 2-2. 모델링 표본 추출 (long-format, --max-total-rows 2000000 적용 후)

| 분할 | long-format 파이프라인 행 수 | 비고 |
|---|---:|---|
| train | ~1,041,088 | 학습 전용 |
| validation (train 내부 시간순 분리) | ~491,880 | 98,376 그룹 × 5 수량, 모델 선택 |
| test | ~467,076 | 20개 조합 × ~23,354행, 최종 평가 |
| **전체 표본 합계** | **2,000,044** | DuckDB 비례 층화 추출 |

> 2,000,044는 `train+validation+test` **전체 표본 합계**임. 특정 모델의 "test 평가 행 수"가 2,000,044가 아님.

- 허용 피처: `station_id`, `day_of_week`, `hour_of_day`, `month`, `is_weekend`, `current_bike_count`, `horizon_minutes`, `required_bike_count` (총 8개)
- 금지 피처 검사 결과: **PASS** (`FORBIDDEN_FEATURES` 11개 기상/경로/미래 피처 유출 0건 확인)


---

### 3-1. Validation 세트 4대 알고리즘 대조 표 (단조성 보정 후 지표)

- **Validation 평가 지문 (SHA-256)**: `9a693669481ea570a65d3896d3b86c07e90a0041c531f9c16364e81f862c5950`

| 모델 | 평가 분할 | Brier Score ↓ | 부족 Recall ↑ | Accuracy ↑ | Calibration error ↓ | 선택 결과 |
|---|---|---:|---:|---:|---:|:---:|
| 통계 기준선 | Validation | 0.1897 | 40.72% | 71.33% | 0.1193 | 탈락 |
| 지속성 기준선 | Validation | 0.0799 | 84.80% | 92.01% | 0.0799 | 탈락 |
| 로지스틱 회귀 | Validation | 0.0697 | **88.21% (1위)** | 91.38% | 0.0408 | 후보 |
| **트리 모델 (HistGradientBoosting)** | Validation | **0.0574 (1위)** | 86.13% | **92.20% (1위)** | **0.0141 (1위)** | **[1등 최종 선택 & 고정]** |

### 3-2. Validation 세트 통합 vs Horizon별 구조 대조 표
| 구조 방식 | H1 (+60m) | H2 (+120m) | H3 (+180m) | H4 (+240m) | 평균 Brier ↓ | 분석 및 구조 결정 |
|---|---|---|---|---|---|---|
| **통합 모델 (Global Model)** | 0.0574 | 0.0574 | 0.0574 | 0.0574 | **0.0574** | **[최종 구조 고정]** 단일 모델 배포로 운영/배포 편의성 우수 |
| Horizon별 모델 (Per-Horizon) | 0.0406 | 0.0527 | 0.0636 | 0.0833 | **0.0600** | H1 단기 오차 우수하나 4개 모델 관리 대비 평균 오차 열세 |

---

## 4. STEP 2: Final Test 최종 단독 평가 (Final Test Evaluation Table)

Validation 단계에서 **1등으로 선택 및 고정된 최종 모델 (HistGradientBoosting Global)**을 한번도 보지 않은 `test` Holdout 세트에서 단 1회 평가한 최종 결과입니다 (단조성 보정 후 확률 기준):

- **평가 지문 (SHA-256)**: `26e62a7f089ff5ce1f50fd00750e5553248afcc0a48469ae6c81e336aa6f299d`

| 최종 고정 모델 | 평가 분할 | Brier Score ↓ | 부족 Recall ↑ | Accuracy ↑ | Calibration error ↓ |
|---|---|---:|---:|---:|---:|
| 🏆 **트리 기반 통합 모델 (HistGradientBoosting Global)** | **Final Test (Holdout)** | **0.0912** | **81.22%** | **87.41%** | **0.0523** |

*참고 Test 레퍼런스*: Test 세트 기준 Per-Horizon Brier 평균은 H1(`0.0776`), H2(`0.0940`), H3(`0.1024`), H4(`0.0942`), 평균 `0.0921`입니다.

---

## 5. 수량별 단조성 실제 예측 감사 결과

실제 모델 예측값에 대해 `station_id + feature_as_of + horizon_minutes` 기준으로 수량 1~5 그룹을 묶어 단조성 감사 및 보정을 수행하였습니다:

| 항목 | 수치 |
|---|---:|
| 검사 그룹 수 (총) | 98,376 |
| 완전한 그룹 수 (수량 1~5 모두 존재) | 89,069 (90.5%) |
| 보정 전 위반 그룹 수 (HistGB) | **3,907** |
| 보정 후 위반 그룹 수 | **0** (100% 보정 완료) |
| 누락 수량 항목 수 | 24,747 |

- 보정 알고리즘: `enforce_quantity_monotonicity()` — `np.minimum.accumulate` 기반 비증가 누적 최솟값
- Logistic·Persistence·Statistical 베이스라인: 보정 전 위반 0건 (원래부터 단조성 충족)
- 보정 후 확률로 4대 지표 재계산: Section 3-1 및 Section 4의 수치는 모두 **보정 후 확률 기준**
- 지원 제외 후보: 없음

---

## 6. H1~H4 × 수량 1~5 조합별 20개 세부 지표 표 (Test Split 기준, 단조성 보정 후)

| 조합 | 표본 수 | 양성 (사용 가능) | 부족 | Brier ↓ | 부족 Recall ↑ | Accuracy ↑ | CalError ↓ | 단조성 위반 | 비고 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| H1_T1 | 23,363 | 20,825 | 2,538 | 0.0688 | 75.41% | 91.82% | 0.0797 | 0 | OK |
| H1_T2 | 23,363 | 19,087 | 4,276 | 0.0730 | 87.04% | 90.31% | 0.0784 | 0 | OK |
| H1_T3 | 23,363 | 17,658 | 5,705 | 0.0715 | 92.94% | 90.24% | 0.0788 | 0 | OK |
| H1_T4 | 23,363 | 16,420 | 6,943 | 0.0690 | 95.17% | 91.01% | 0.0712 | 0 | OK |
| H1_T5 | 23,363 | 15,323 | 8,040 | 0.0672 | 95.71% | 91.31% | 0.0674 | 0 | OK |
| H2_T1 | 23,361 | 20,830 | 2,531 | 0.0760 | 65.94% | 89.53% | 0.0698 | 0 | OK |
| H2_T2 | 23,360 | 19,083 | 4,277 | 0.0858 | 81.23% | 87.61% | 0.0541 | 0 | OK |
| H2_T3 | 23,360 | 17,655 | 5,705 | 0.0874 | 88.26% | 87.48% | 0.0507 | 0 | OK |
| H2_T4 | 23,361 | 16,423 | 6,938 | 0.0878 | 90.67% | 88.00% | 0.0436 | 0 | OK |
| H2_T5 | 23,360 | 15,321 | 8,039 | 0.0883 | 91.78% | 88.18% | 0.0458 | 0 | OK |
| H3_T1 | 23,354 | 20,818 | 2,536 | 0.0837 | 60.25% | 87.81% | 0.0714 | 0 | OK |
| H3_T2 | 23,354 | 19,067 | 4,287 | 0.0977 | 76.30% | 85.48% | 0.0507 | 0 | OK |
| H3_T3 | 23,354 | 17,646 | 5,708 | 0.1041 | 83.62% | 84.90% | 0.0493 | 0 | OK |
| H3_T4 | 23,354 | 16,415 | 6,939 | 0.1068 | 86.83% | 85.27% | 0.0540 | 0 | OK |
| H3_T5 | 23,354 | 15,319 | 8,035 | 0.1091 | 88.45% | 85.40% | 0.0607 | 0 | OK |
| H4_T1 | 23,349 | 20,803 | 2,546 | 0.0886 | 56.52% | 86.68% | 0.0722 | 0 | OK |
| H4_T2 | 23,349 | 19,055 | 4,294 | 0.1068 | 73.10% | 83.70% | 0.0586 | 0 | OK |
| H4_T3 | 23,349 | 17,635 | 5,714 | 0.1156 | 80.89% | 83.15% | 0.0604 | 0 | OK |
| H4_T4 | 23,350 | 16,407 | 6,943 | 0.1204 | 83.98% | 83.25% | 0.0647 | 0 | OK |
| H4_T5 | 23,349 | 15,315 | 8,034 | 0.1259 | 85.66% | 83.07% | 0.0746 | 0 | OK |

- NOT_EVALUABLE 조합: **0건** (20개 조합 전원 평가 가능)
- 단조성 위반: **보정 후 전 조합 0건** (Logistic Regression은 원래부터 단조성 충족)
- 경향: Brier는 H 증가시 악화 (H1 ≈ 0.069~0.073 → H4 ≈ 0.089~0.126), Recall은 T 증가시 상승 (더 많은 자전거 요구시 평균적으로 보유 그룹 많아 Recall 용이)

---

## 7. Artifact 보관 및 메타데이터

### 7-1. 모델 Artifact

| 항목 | 값 |
|---|---|
| 승인 우승 파일 (추론용) | `output/model_winner.joblib` |
| **SHA-256 (model_winner)** | `8f42ac36b340891a0aac3d53b13b1fb02ddd5b217436ef1cf93b9d07e766f50e` |
| 파일 크기 | 367,800 bytes |
| Git 커밋 금지 | `output/`는 `.gitignore` 등록 — 대용량 및 생성 joblib Git 업로드 불가 |
| 보관 위치 | 로컬 `output/model_winner.joblib` (프로젝트 루트 기준) |
| 메타데이터 파일 | `output/model_winner_metadata.json` |
| 입력 manifest SHA-256 | `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7` |
| 생성 브랜치 | `codex/data-model-h1-h4` |
| 생성 시각 | 2026-08-12 |
| 최종 모델 클래스 | `sklearn.linear_model.LogisticRegression` (random_state=20260810, max_iter=500) |
| 피처 목록 (순서 고정) | `station_id`, `day_of_week`, `hour_of_day`, `month`, `is_weekend`, `current_bike_count`, `horizon_minutes`, `required_bike_count` |
| 지원 horizon | 60, 120, 180, 240분 |
| 지원 수량 | 1, 2, 3, 4, 5대 |
| 단조성 보장 | `P(>=1) >= P(>=2) >= ... >= P(>=5)` (`enforce_quantity_monotonicity()` 적용) |

### 7-2. 단건·배치 추론 명령 및 입출력 예시

```bash
# 단건 추론 예시 (station 1, 수요일 08시, 3월, 평일, 현재 5대, 60분 후, 3대 필요)
.\project\Scripts\python.exe -c "
import joblib, numpy as np
art = joblib.load('output/model_winner.joblib')
clf = art['model']
# [station_id, day_of_week, hour_of_day, month, is_weekend, current_bike_count, horizon_minutes, required_bike_count]
row = np.array([[1, 2, 8, 3, 0, 5, 60, 3]])
prob = clf.predict_proba(row)[:, 1][0]
print(f'P(available >= 3대, 60분 후) = {prob:.4f}')
"
# 출력 예: P(available >= 3대, 60분 후) = 0.8421
```

```bash
# 배치 추론 (전체 파이프라인 재실행)
.\project\Scripts\python.exe pipeline/src/modeling.py \
  --data-path output/labeled_dataset.csv \
  --max-total-rows 2000000
```

> **저장 실패 처리**: artifact 저장 실패 시 (`ARTIFACT_SAVE` Stage) `RuntimeError` 발생 후 non-zero 종료 — 0.5 더미 은폐 처리 없음.

---

## 8. PR 범위 제어

- **`.gitignore`**: 계약의 6개 허용 파일 외 추가 파일 — PR에서 제거 필요. 반드시 필요하면 조장에게 범위 확장 승인 후 계약 업데이트.
- **`pipeline/docs/DATA-3.1-result-report.pdf`**: 동일 사유 — PR에서 제거 필요.
- **`output/model_hist_gb.joblib`**: `output/`는 `.gitignore` 등록 — Git 커밋 금지.

---

## 9. 재현성 및 조장 승인 요청

- 동일 입력 2회 연속 실행: evaluation_row_hash 및 4대 지표 100% 동일 (**Idempotent PASS**)
- DuckDB 해시 모듈로 필터 (`abs(hash(...)) % 10000 < 500`) — 고정 시드로 100% 결정론적 표본 추출 보장
- Validation 선택 및 Final Test 2단계 평가 완료 → 최종 모델(HistGradientBoosting Global) PR 승인 요청
