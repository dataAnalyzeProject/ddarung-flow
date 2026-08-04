# DATA-2.0 데이터 소스 감사 및 검증 파이프라인

본 파이프라인은 서울시 공공자전거(따릉이) 2022~2025년 시간대별 데이터셋의 무결성, 스키마, 결합률 및 H1~H4 (60/120/180/240분) 관측 존재율과 필요 수량별(1~5대) 성공/실패 분포를 재현 검증합니다.

## 1. 파일 구조

```
pipeline/
├── src/
│   └── data_source_audit.py        # 메인 감사 및 검증 파이프라인 스크립트
├── docs/
│   └── DATA-2.0-result.md          # 조장 제출용 재현 검증 결과 보고서
├── README.md                       # 실행 가이드 및 설명 문서
└── requirements.txt                # 요구되는 파이썬 의존성 패키지
```

## 2. 설치 및 실행 가이드

### 의존성 설치
```bash
pip install -r pipeline/requirements.txt
```

### 실행 명령
```bash
python pipeline/src/data_source_audit.py --input-dir "C:\Users\M\Desktop\데이터셋" --output-dir "C:\Users\M\Desktop\DATA-2.0-output"
```

## 3. 주요 기능 및 검증 방식
* **Chunk 처리 (메모리 최적화)**: 큰 CSV 파일을 메모리에 한 번에 올리지 않고 200,000행 단위(Chunk)로 안전하게 읽어 전수 조사를 수행합니다.
* **상대경로 & SHA-256 기록**: 보안과 이식성을 위해 원본 절대경로 대신 상대경로와 파일 무결성을 위한 SHA-256 해시를 기록합니다.
* **Pandas Assertion 기반 품질 규칙**: 0대, 누락, 음수, 중복 검증 규칙 및 `approved=false` 승인 전 플래그 안전 보장.
* **출력 파일 생성**: 지정된 `--output-dir` 위치에 `file_summary.csv`, `year_summary.csv`, `schema_differences.csv`, `recommended_inventory_manifest.csv`를 생성합니다.
