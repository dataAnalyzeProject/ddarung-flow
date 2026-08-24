# DATA-5.1A 6버킷 재고 분포 모델 평가 도구 문서

## 1. 개요 및 목적

본 문서는 이미 학습된 6버킷 재고 분포 모델(`HistGradientBoostingClassifier`, `0,1,2,3,4,5+` 버킷)이 20개 조합(4개 horizon × 5개 필요 자전거 수)에 대해 동일한 검증 기준과 단조성(Monotonicity)을 준수하며 평가되는지 확인하는 `distribution_evaluation.py` 검증 도구의 사용 가이드입니다.

- **입력**: 6버킷 분포 모델 아티팩트 (`model_artifact`) 및 시계열 Test Split 레코드 (`split == "test"`)
- **출력**: 정확히 20개 고유 조합 (4개 Horizon × 5개 필요 수량)의 평가 지표 행 (sampleCount, observedSuccessRate, brierScore)

---

## 2. 20개 조합 결과 구조 및 사양

각 평가 행은 아래 필드로 구성되며 고정된 순서(H1..H4, Q1..Q5)로 반환됩니다.

| horizonMinutes | requiredBikeCount | sampleCount | observedSuccessRate | brierScore |
|---|---|---|---|---|
| 60 | 1 | 2 | 1.0000 | 0.0520 |
| 60 | 2 | 2 | 1.0000 | 0.0831 |
| 60 | 3 | 2 | 1.0000 | 0.1012 |
| 60 | 4 | 2 | 1.0000 | 0.1205 |
| 60 | 5 | 2 | 0.5000 | 0.1540 |
| 120 | 1 | 2 | 1.0000 | 0.0610 |
| 120 | 2 | 2 | 1.0000 | 0.0920 |
| ... | ... | ... | ... | ... |
| 240 | 5 | 2 | 0.0000 | 0.1890 |

---

## 3. 실행 및 테스트 명령

### 3.1 평가 도구 전용 단위 테스트 실행
```powershell
.\.venv\Scripts\python.exe -m pytest pipeline/tests/test_distribution_evaluation.py -v
```

### 3.2 전체 파이프라인 테스트 수트 실행
```powershell
.\.venv\Scripts\python.exe -m pytest pipeline/tests -q
```

---

## 4. 검증 규격 및 실패 거절 규칙

1. **6버킷 모델 검증**: `bucket_definition`이 `"0,1,2,3,4,5+"`가 아니거나 2클래스 바이너리 모델일 경우 즉시 `ValueError`로 거절합니다.
2. **Test Split 검증**: `split != "test"`인 데이터가 입력될 경우 `ValueError`로 거절합니다.
3. **확률 범위 및 단조성 검증**: 예측 확률이 `0.0~1.0` 범위를 벗어나거나 (예: 5대 필요 확률이 1대 필요 확률보다 커지는 등) 수량 증가 시 확률이 증가하는 역전 현상이 발생할 경우 `ValueError`로 거절합니다.
4. **20개 조합 완전성**: 4개 Horizon (60, 120, 180, 240) 및 5개 수량 (1~5) 중 하나라도 레코드가 미달되면 거절합니다.

---

## 5. 조장 최종 확인용 아티팩트 및 해시 기록 위치

- **Model Artifact SHA-256**: `2f2ece729fd4b03954212d2fcc2ece4cd07110c947fae1dfc0c7ba29cde34db9`
- **Evaluation Records SHA-256**: `4920133bd39440472b90eec65babf7db7fafca353a9b8208519e7d0a79d79ae1`
