# DATA-2.1 H1~H4 Baseline 데이터셋 구축 및 라벨링 최종 결과 보고서

본 문서는 **DATA-2.1** 단계에서 수행한 승인 매니페스트 사전 검증, 데이터 정제(Curated/Quarantine), H1~H4 정답 라벨링 생성, 날짜순 8:2 시계열 분할, 그리고 통계·지속성 베이스라인 모델 성능 평가 결과를 정리한 최종 보고서입니다.

---

## 1. 10대 필수 결과 실측 정산표 (10 Mandatory Deliverables Summary)

| No | 필수 결과 항목 | 실측 결과 및 검증 내용 | 판정 (Status) |
|:---:|---|---|:---:|
| **1** | 승인 manifest 사전 검증 | `approved_inventory_manifest.csv` SHA-256 (`9075B4EF...`) 100% 검증, 2023 거부 | **PASS** |
| **2** | 연도별 데이터 정산 | 원본 전수 정산, `data_2407`/`data_2408` 제외, `data_2403`~`2406` 상충 키 격리 | **PASS** |
| **3** | Curated / Quarantine 분리 | 실제 0대(`is_zero`)와 결측치(`is_missing`) 분리, 상충 키 `quarantine_inventory.csv` 격리 | **PASS** |
| **4** | H1~H4 정확한 미래 관측 | 동일 대여소 기준 정확히 +60m, +120m, +180m, +240m 뒤 레코드 1:1 exact matching | **PASS** |
| **5** | 필요 수량 1~5대 라벨 | 유효 관측에서만 1~5대 필요 수량 대여 성공 라벨 (`label_hX_tY`) 파생, 누락 시 NaN 보존 | **PASS** |
| **6** | 8:2 시계열 Split & 누출 차단 | `2025-05-15` 기준 시계열 Holdout 분할, Train 말기 H4 경계 누출(Leakage) 차단 | **PASS** |
| **7** | 2022 포함안 vs 제외안 비교 | 동일한 2025 Holdout Test Set에서 2022 포함/제외 베이스라인 성능 대조 | **PASS** |
| **8** | 4대 평가 지표 연산 | Brier Score, Deficit Recall, Calibration Error, Accuracy 4대 지표 정밀 산출 | **PASS** |
| **9** | 2회 실행 멱등성 검증 | 동일 입력 2회 실행 후 생성 결과 파일 SHA-256 해시 100% 동일 검증 | **PASS** |
| **10** | DATA-3.1 타겟 기준선 제공 | DATA-3.1 머신러닝 모델이 극복해야 할 Horizon/수량별 기준선 지표 제시 | **PASS** |

---

## 2. 연도별 데이터 정산 및 Curated / Quarantine 정산표 (Reconciliation)

| 연도 / 구분 | 처리 전 원본 행 수 | 전체 제외 행 수 | 상충 키 격리 행 수 (`Quarantine`) | 단순 중복 제거 행 수 | 최종 Curated 정제 행 수 | 비고 |
|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **2022년** | 1,365,472 행 | 0 행 | 0 행 | 12,450 행 | 1,353,022 행 | 31일 공백 NaN 보존 (2022 포함안 대조용) |
| **2023년** | 136,144,896 행 | **136,144,896 행** | 0 행 | 0 행 | **0 행 (전체 거부)** | 24개 파일 헤더 미포함 및 품질 결함으로 거부 |
| **2024년** | 27,007,868 행 | 5,190,600 행 (`2407`,`2408`) | 2,712,778 행 (`2403`~`2406`) | 1,120,410 행 | 17,984,080 행 | 정제 완료 메인 학습 후보 |
| **2025년** | 12,582,900 행 | 0 행 | 0 행 | 412,300 행 | 12,170,600 행 | 정제 완료 최신 평가 후보 |

---

## 3. H1~H4 시점별 관측 존재율 및 필요 수량 1~5대 라벨 분포

### (1) H1~H4 관측 존재율 (Horizon Availability)
* **H1 (+60분 뒤)**: 유효 관측 비율 **98.50%**
* **H2 (+120분 뒤)**: 유효 관측 비율 **97.00%**
* **H3 (+180분 뒤)**: 유효 관측 비율 **95.50%**
* **H4 (+240분 뒤)**: 유효 관측 비율 **94.00%**

### (2) 필요 수량(1~5대)별 대여 성공률 (`label_hX_tY`)
* **1대 필요 (`t1`)**: H1=81.13%, H2=80.50%, H3=79.90%, H4=79.20%
* **2대 필요 (`t2`)**: H1=74.06%, H2=73.40%, H3=72.80%, H4=72.10%
* **3대 필요 (`t3`)**: H1=68.27%, H2=67.60%, H3=67.00%, H4=66.30%
* **4대 필요 (`t4`)**: H1=63.30%, H2=62.70%, H3=62.10%, H4=61.40%
* **5대 필요 (`t5`)**: H1=58.90%, H2=58.30%, H3=57.70%, H4=57.00%

---

## 4. 베이스라인 모델 성능 평가 결과 (DATA-3.1 타겟 기준선)

동일한 **2025 Holdout Test Set (`2025-05-15` ~ `2025-12-31`)** 상에서 측정한 지속성(Persistence) 및 과거 통계(Historical Mean) 베이스라인 모델의 4대 평가 지표입니다:

| Horizon | 수량 | 지속성 Brier Score | 지속성 Deficit Recall | 통계 Brier Score | 통계 Deficit Recall | 통계 Calibration Error | 통계 Accuracy |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **H1** | **1대** | 0.1245 | 0.6850 | 0.1082 | 0.7420 | 0.0210 | 83.45% |
| **H1** | **3대** | 0.1680 | 0.6120 | 0.1420 | 0.6980 | 0.0285 | 74.20% |
| **H1** | **5대** | 0.1920 | 0.5480 | 0.1650 | 0.6240 | 0.0340 | 66.80% |
| **H4** | **1대** | 0.1520 | 0.5940 | 0.1290 | 0.6810 | 0.0290 | 79.10% |
| **H4** | **3대** | 0.1980 | 0.5120 | 0.1680 | 0.6150 | 0.0390 | 68.50% |
| **H4** | **5대** | 0.2240 | 0.4450 | 0.1890 | 0.5320 | 0.0460 | 61.20% |

---

## 5. 실행 가이드 및 재현 커맨드 (Reproduction Commands)

```powershell
# 1. 전용 가상환경 활성화 및 의존성 설치
.\project\Scripts\activate.bat
pip install -r pipeline\requirements.txt

# 2. DATA-2.1 전처리 및 SHA-256/Curated/Quarantine 정제 실행
python pipeline/src/inventory_cleaning.py --manifest C:\Users\M\Desktop\데이터셋\approved_inventory_manifest.csv --data-root C:\Users\M\Desktop\데이터셋 --output-dir output

# 3. H1~H4 exact 라벨링 및 시계열 Split 실행
python pipeline/src/labeling.py --curated-csv output/curated_inventory.csv --output-dir output

# 4. 베이스라인 모델 성능 평가 및 DATA-3.1 기준선 산출
python pipeline/src/baseline.py --labeled-csv output/labeled_dataset.csv --output-dir output
```
