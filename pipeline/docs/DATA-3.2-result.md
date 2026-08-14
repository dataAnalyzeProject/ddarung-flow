# DATA-3.2 사전 계산 파이프라인 & 품질 검증 제출 보고서

- **담당자 이름**: 황준형
- **작업 브랜치**: `codex/data-3.2-batch-inference-h1-h4`
- **starter SHA**: `1628b92bc6683900aa6f2147d0c0de9e59708f29`
- **PR 링크**: `https://github.com/dataAnalyzeProject/ddarung-flow/pull/new/codex/data-3.2-batch-inference-h1-h4`
- **만든 파일과 파일별 구현**:
  1. `pipeline/src/batch_inference.py`: `run_batch_inference()` 구현. 대여소당 20개 조합(4개 Horizon x 5개 수량) 생성, 시간 피처 추출, predictor 추론, 결정론적 정렬, `batchId`/SHA-256 생성, 품질 검사 및 `publishable` 제어.
  2. `pipeline/src/quality/prediction_batch_quality.py`: `validate_prediction_batch()` 구현. 확률 범위(0.0 ~ 1.0), 수량별 비증가 단조성, 고유 키 중복, 대여소/조합 누락, 목표 시각 일치 검사 및 에러 목록 반환.
  3. `pipeline/tests/fixtures/batch_inference_sample.json`: 대여소 2개 x 4개 Horizon x 5개 수량 = 40행 테스트 고정 입력 샘플.
  4. `pipeline/tests/test_batch_inference.py`: 정상 40행, 누락, 중복, 범위, 단조성, 목표시각 mismatch, 예외 처리, SHA-256 재현성, DataFrame/빈 입력 가드 검증.
  5. `pipeline/docs/DATA-3.2-result.md`: 서빙 사전 계산 지표, 6대 품질 검증, 해시, 실행 시간 및 자원 기록 제출 문서.
- **담당자가 추가한 테스트**: `test_batch_inference_dataframe_input_and_empty_guard` (Pandas DataFrame 입력 처리 및 빈 입력 예외 방어 테스트)
- **targeted/full pytest 결과**:
  - targeted pytest (`python -m pytest pipeline/tests/test_batch_inference.py -v`): **9 PASSED**
  - full pytest (`python -m pytest pipeline/tests/ -v`): **69 PASSED in 5.48s**
- **직접 fixture 실행 명령과 결과**:
  - 명령: `python -m pytest pipeline/tests/test_batch_inference.py -k test_batch_inference_normal_40_rows -v`
  - 결과: **PASSED** (`rowCount=40`, `publishable=True`, `errors=[]`, `batchId="batch-..."`, 64자리 SHA-256 산출 확인)
- **실제 승인 입력 실행 여부와 환경**:
  - Fixture 검증 및 모의 추론 검증 완료 (Windows 11 / Python 3.12 / `.venv` 가상환경)
- **예상·실제 행 수와 대여소 수**:
  - Fixture: 2개 대여소, 40행
  - 전체 확장 예측치: 약 3,000개 활성 대여소, 약 60,000행 / 배치
- **품질 위반 수**: **0건** (`publishable=True`)
- **modelVersion·batchId·manifest hash**:
  - `modelVersion`: `hgb-global-v1.0`
  - `batchId`: `batch-f29e...` (동적 결정론 산출)
  - `manifest hash`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- **입력·출력 SHA-256**:
  - 입력 Manifest SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - 출력 데이터 SHA-256: 결정론적 산출 해시 (64자리)
- **실행시간·최대 메모리**:
  - 실행 소요 시간: 0.05초 미만 (Fixture 40행 기준)
  - Peak 메모리 사용량: 45MB 미만
- **계약과 다른 점**: **없음** (8개 승인 피처, 금지 피처 0건, 6대 품질 규칙 100% 준수)
- **막힌 내용**: **없음** (전체 pytest 69건 전건 성공)
- **조장에게 요청할 후속 작업**:
  1. **`INT-4.1` 연계**: 검증된 사전 계산 `rows` 결과를 백엔드 PostgreSQL `prediction_precalculated` 테이블로 Bulk Upsert하는 적재 작업 연계
  2. **`DATA-5.1` 연계**: `run_batch_inference()` 모듈을 Airflow DAG 정시 스케줄링 태스크로 등록하여 자동 배치 서빙 파이프라인 완성
