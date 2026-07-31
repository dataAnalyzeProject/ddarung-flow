# 예측 데이터 파이프라인

서울시 대여소·재고 데이터와 날씨 데이터를 수집하고, 품질을 확인해 정제한 뒤 미래 대여 가능성을 주기적으로 미리 계산하는 영역입니다.

## 확정 기술

- Python
- Pandas
- PyArrow
- Airflow
- OCI Python SDK
- Raw JSON과 Curated Parquet
- pytest

현재 MVP에는 DuckDB, Polars와 PySpark를 추가하지 않습니다. 데이터 처리 표준은 Pandas와 PyArrow이며, 실제 처리시간이나 메모리 병목이 검증되기 전에는 처리 엔진을 늘리지 않습니다.

## 확정 데이터 흐름

```text
자료 수집
→ OCI Object Storage에 Raw 원본 보관
→ Pandas·PyArrow로 품질 확인·정제·결합
→ 실패 데이터는 Quarantine, 정상 데이터는 Curated Parquet로 보관
→ 확정 모델로 모든 대여소와 시간 구간의 예측을 미리 계산
→ 결과 검증
→ PostgreSQL에 최신 정상 예측 결과 게시
```

사용자가 예측 버튼을 누를 때마다 모델을 새로 실행하지 않습니다. Airflow가 수집·품질검사·정제·배치 예측·게시 순서를 관리합니다.

새 예측 결과는 행 수, 확률 범위, 대여소, 기준시각, 목표시각과 모델 버전 검사를 통과한 뒤에만 최신 정상 결과로 전환합니다. 새 계산이나 게시가 실패해도 기존 최신 정상 결과를 삭제하거나 교체하지 않습니다.

## 저장과 실행 책임

- 전체 Raw·Quarantine·Curated·모델·품질 산출물은 OCI Object Storage에 보관합니다.
- 서비스에서 조회할 검증된 예측 결과만 PostgreSQL에 게시합니다.
- 모델 탐색·비교·학습과 대규모 정제는 데이터 담당자의 로컬 환경에서 수행합니다.
- 채택 모델과 재현에 필요한 산출물만 OCI Object Storage에 등록합니다.
- OCI 운영 환경에서는 Airflow LocalExecutor를 사용하고 초기 동시 작업 수와 DAG 동시 실행 수를 각각 1로 제한합니다.

## 아직 확정하거나 구현할 항목

- Python 의존성 파일과 패키지 버전
- 실제 수집·검증·정제 코드와 Airflow DAG
- 최종 모델과 피처
- 배치 주기, 만료 기준과 재실행·Upsert 규칙
- 날씨 데이터 실패 시 기준 모델 사용 조건

위 항목은 Notion의 데이터 계약과 설계가 승인된 뒤 구현합니다.
