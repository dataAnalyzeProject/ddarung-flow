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

## 5. 조장 최종 확인용 현행 아티팩트·근거

- **현행 모델 버전**: `data-3.3-inventory-distribution-2026-08-18`
- **현행 Model Artifact SHA-256**: `ceeccca92448a42ceaa60bbd609b690f0f185bf0cbb6b7ca38255e2cf6259741`
- **현행 모델 manifest**: [MODEL-5.1 model_manifest.json](https://drive.google.com/file/d/1UJwTae5OLIsKy3BfC0InWbo9F9VXO6qu/view)
- **사후 재현 입력 manifest**: [MODEL-5.1_retro-input-manifest.json](https://drive.google.com/file/d/1nluNmoN8FW964aUxDIvvfeLONaAlpYwv/view), source SHA-256 `0e5ed94f13e732fa70799681c58cc74801b231e43c9e2d9edbd480c0bd80a182`
- **20개 조합 사후 재현 평가**: [MODEL-5.1_retrospective-evaluation.json](https://drive.google.com/file/d/1Dp2imtrAKr1MdEmJRcgnf3cWsqDCTokd/view), 2,113,506행, 단조성 위반 0건
- **실행로그·체크섬**: [MODEL-5.1_retro-execution-log.json](https://drive.google.com/file/d/1XolFqFiiVR59UQoLDiTT3BzjrGj0z1_i/view), [SHA256SUMS](https://drive.google.com/file/d/11DH9-3yWkEkdEkbyAlM0FM4H-eze_rhp/view)

위 평가는 원본 학습 입력과 sealed-test 기록이 남아 있지 않아 새로 수행한 **사후 재현 평가**다. 조장 결정으로 DATA-5.1A의 현행 artifact 직접 실행·20개 조합·단조성 확인 근거로는 허용하되, sealed 평가 완료로 표기하지 않는다. 기존 `2f2ece…` artifact와 `492013…` evaluation hash는 이전 모델 기록으로 보존하며 현행 모델 근거로 사용하지 않는다.
