# DATA-5.2 6버킷 분포 모델 Sealed Test 20조합 평가 가이드

## 1. 개요 및 목적

본 문서는 현행 승인된 6버킷 재고 분포 모델(`HistGradientBoostingClassifier`, `0, 1, 2, 3, 4, 5대 이상` 버킷)을 재구성된 비공개 시험 데이터(`reconstructed historical test` / `test_wide_labels.parquet`)로 평가하고, **4개 예측 시간(60분, 120분, 180분, 240분) × 5개 필요 자전거 수(1대~5대) = 총 20개 시나리오**에 대한 예측 성능과 품질 지표를 산출하는 `sealed_distribution_evaluation.py` 모듈의 운영 및 검증 가이드입니다.

- **데이터셋 성격**: `reconstructed historical test` (재구성된 과거 시험 데이터셋)
- **유효성 필터링**: H1~H4에서 `target_valid_h* = false`인 행은 평가 대상에서 제외됩니다.

---

## 2. 시작 기준 및 고정값 (SHA-256 해시값)

본 평가는 파일이 위변조되지 않았는지 확인하는 사전 무결성 검증을 통과해야만 실행됩니다. 아래 고정값과 1글자라도 다르면 평가를 시작하기 전에 즉시 중단(거절)됩니다.

| 항목 | 고정값 | 설명 |
| :--- | :--- | :--- |
| **작업 브랜치 (branch)** | `codex/data-5.2-distribution-sealed-evaluation` | 작업 대상 Git 브랜치 |
| **기준 커밋 (starter commit)** | `ecee9fc6af5e512cbb78273392151d5dfbea530c` | 시작 기준 커밋 해시 |
| **모델 버전** | `data-3.3-inventory-distribution-2026-08-18` | 공식 승인 모델 버전명 |
| **모델 파일 해시 (Artifact SHA-256)** | `ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741` | 현행 승인 모델 (`model.joblib`) |
| **모델 명세서 해시 (Model Manifest SHA-256)** | `973b90ff6e44dc62529396e5773ce3d2001b68861aa10e68b490ec58dc2b4a95` | 모델 메타데이터 명세서 (`model_manifest.json`) |
| **승인 원본 매니페스트 해시** | `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7` | 학습 원본 매니페스트 (`approved_inventory_manifest.csv`) |
| **재구성 시험 데이터 해시 (Sealed Test SHA-256)** | `c71da6e5923be349b963ef23f6fda74505e18970212fccf9d2d0581ca8d8998a` | `reconstructed historical test` (`test_wide_labels.parquet`) |

---

## 3. 실행 명령어

### 3.1 단위 테스트 실행 (모의 데이터로 검증)
```powershell
# 신규 sealed evaluation 테스트
.\.venv\Scripts\python.exe -m pytest pipeline\tests\test_sealed_distribution_evaluation.py -q

# 기존 evaluation 테스트
.\.venv\Scripts\python.exe -m pytest pipeline\tests\test_distribution_evaluation.py -q
```

### 3.2 실제 Sealed Evaluation CLI 실행
```powershell
.\.venv\Scripts\python.exe -m pipeline.src.sealed_distribution_evaluation `
  --artifact "$env:DATA52_PRIVATE_DIR\model.joblib" `
  --manifest "$env:DATA52_PRIVATE_DIR\model_manifest.json" `
  --sealed-input "$env:DATA52_PRIVATE_DIR\test_wide_labels.parquet" `
  --output "$env:DATA52_PRIVATE_DIR\DATA-5.2-output" `
  --expected-artifact-sha256 ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741 `
  --expected-manifest-sha256 973b90ff6e44dc62529396e5773ce3d2001b68861aa10e68b490ec58dc2b4a95 `
  --expected-sealed-input-sha256 c71da6e5923be349b963ef23f6fda74505e18970212fccf9d2d0581ca8d8998a
```

---

## 4. 출력 결과 설명 (총 20개 조합)

결과 파일(`sealed_evaluation_20_combinations.json`)에는 20개 행이 출력되며, 각 항목의 쉬운 뜻은 다음과 같습니다.

### 4.1 출력 필드 설명
- **`horizonMinutes` (예측 시간)**: 몇 분 뒤를 예측했는지 (60분, 120분, 180분, 240분)
- **`requiredBikeCount` (필요 자전거 수)**: 몇 대 이상 남아있을 확률인지 (1대, 2대, 3대, 4대, 5대 이상)
- **`sampleCount` (전체 샘플 수)**: 유효한 평가 데이터 행 수 (`target_valid_h* = true`인 행만 집계)
- **`successCount` (성공 건수)**: 실제로 자전거가 필요 수량 이상 남아있었던 건수
- **`deficitCount` (부족 건수)**: 실제로 자전거가 부족했던 건수
- **`brierScore` (브라이어 오차 점수)**: 모델의 예측 확률이 실제 결과와 얼마나 잘 맞았는지 나타내는 오차 점수 (0점에 가까울수록 정확함)
- **`accuracy` (예측 정확도)**: 50% 확률을 기준으로 '성공/부족'을 맞힌 비율 (1.0 = 100% 정답)
- **`deficitRecall` (부족 감지율 / 재현율)**: 실제로 자전거가 부족했던 상황을 모델이 사전에 부족하다고(확률 50% 미만으로) 올바르게 감지해낸 비율. 만약 실제 부족했던 경우가 0건이면 억지로 0으로 왜곡하지 않고 `NOT_EVALUABLE`로 표기하며 그 사유를 기록함.
- **`calibrationError` (확률 보정 오차)**: 모델이 "성공 확률 80%"라고 예측했을 때 실제로도 10번 중 8번 성공했는지, 즉 모델이 뱉은 확률 수치가 얼마나 정직하고 믿을 만한지를 나타내는 오차값
- **`probabilityMin` / `probabilityMax` (최소/최대 예측 확률)**: 해당 조건에서 모델이 출력한 가장 낮은 확률과 가장 높은 확률

---

## 5. 성공 / 실패 판정 규칙 (PASS / FAIL)

1. **사전 무결성 검증 (해시 일치)**: 모델, 명세서, 테스트 데이터의 SHA-256 해시값과 명세서 내용이 기준과 다르면 즉시 실패(FAIL).
2. **6버킷 규격 준수**: 2클래스 구형 이진 분류 모델이거나 버킷 정의가 `0,1,2,3,4,5+`가 아니면 즉시 실패(FAIL).
3. **확률 범위 준수**: 예측 확률이 `0% ~ 100% (0.0 ~ 1.0)` 범위를 벗어날 경우 실패(FAIL).
4. **단조성(상식적 확률 순서) 준수**: 같은 대여소와 시간대에서 **필요한 자전거 수가 늘어날수록 성공 확률은 줄어들거나 같아야 하며**, 반대로 자전거 수가 늘어났는데 확률이 올라가는 역전 현상이 발생하면 즉시 실패(FAIL).
5. **20개 조합 완전성**: 4개 시간 × 5개 수량 = 총 20개 조합이 누락 없이 모두 평가되어야 함.

---

## 6. 비공개 데이터(Private-Local) 보호 및 제출 규칙

- **비공개 원칙**: `test_wide_labels.parquet` 원본 파일 자체 및 로컬 PC 경로는 Git 저장소, Google Drive, Notion 어디에도 커밋하거나 업로드하지 않습니다.
- **제출 대상**:
  - `sealed_evaluation_20_combinations.json` (20개 조합 평가 결과)
  - `sealed_evaluation_summary.json` (전체 요약 보고서, `test_dataset_label: "reconstructed historical test"`)
  - `SHA256SUMS` (위 파일들의 체크섬)
