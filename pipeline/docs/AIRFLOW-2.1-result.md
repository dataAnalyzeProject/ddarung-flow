# AIRFLOW-2.1 개발 실행환경 결과

## 범위

- 브랜치: `codex/data-platform-setup`
- 기준 커밋: `646e273`
- 검증일: 2026-08-03
- Airflow: `apache/airflow:3.3.0`
- Executor: `LocalExecutor`
- 개발 일정: 수동 실행(`schedule=None`), 동시 DAG 실행 1개

이번 결과는 fixture 검증, 서울시 실시간 따릉이 API, 기상청 초단기실황 API,
로컬·OCI Object Storage Raw 저장 검증을 포함합니다. 운영 비밀정보,
PostgreSQL 결과 게시와 운영 배포는 포함하지 않습니다.

## 구현한 흐름

1. 따릉이 재고는 fixture 또는 서울시 실시간 API에서 수집하고, 날씨는 fixture로 수집합니다.
2. 원본 응답과 `observed_at`, `collected_at`을 Raw JSON에 보존합니다.
3. 재고 0대는 정상값으로 유지하고, 빈 응답·누락·음수·미래 타깃 필드는 품질 실패로 분류합니다.
4. 날씨 관측·예보 구분, 위치키, 온도와 강수 항목을 검사합니다.
5. 품질검사를 통과한 경우에만 표준 Curated 값을 만듭니다.
6. 수집 또는 품질검사가 실패하면 Curated 태스크가 실행되지 않습니다.

## Raw·Curated 경계

### Raw

- 개발 루트: `D:\ddarung-flow-data\platform\raw\`
- 논리 파티션: `<source>/year=YYYY/month=MM/day=DD/`
- 중복 키: `source + observed_at + collected_at`
- 저장 내용: source, 관측시각, 수집시각, 훼손하지 않은 원본 payload

### Curated

- 재고 논리 열: `station_id`, `station_name`, `observed_at`, `bike_count`, `rack_count`, `latitude`, `longitude`, `collected_at`
- 날씨 논리 열: `observed_at`, `location_key`, `temperature`, `precipitation`, `weather_source`, `collected_at`
- 현재는 DAG 실행 결과로 검증합니다. DATA-2.1 승인 후 실제 정제 함수의 입출력과 연결합니다.
- Raw 원문은 PostgreSQL에 게시하지 않습니다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 새 Windows 가상환경 패키지 설치 | `requirements.txt` 인코딩 오류 없이 성공 |
| Python fixture·수집·품질·중복방지 테스트 | 새 Windows 가상환경에서 `23 passed` |
| Docker Compose 설정 해석 | 성공 |
| Airflow 3.3.0 이미지 빌드 | 성공 |
| PostgreSQL 메타데이터 초기화 | 성공, `airflow-init` 종료코드 0 |
| DAG 목록 | `bike_weather_raw_curated` 확인 |
| DAG import 오류 | 없음 |
| 정상 fixture DAG test | 성공 |
| Curated 필수 필드 누락 fixture | 품질검사에서 Curated 실행 전 차단 |
| 서울시 실시간 API 전체 페이지 수집 | 3페이지, 대여소 2,743개, 성공 |
| 실제 API Raw JSON 저장 | 3개 원본 페이지·2,743행 보존, 성공 |
| 실제 API DAG test | 따릉이·기상청 초단기실황을 함께 호출해 전체 DAG 성공 |
| 기상청 초단기실황 | 서울 격자 `60,127`, 관측 8개 항목 수집·품질검사·Curated 성공 |
| OCI config 파일 인증 | Object Storage namespace·버킷 조회 성공 |
| OCI Raw 업로드 | 따릉이·날씨 실제 Raw 업로드 성공 |
| OCI 객체 재실행 | 같은 객체 이름의 덮어쓰기 차단, 추가 객체 없음 |
| OCI Instance Principal | Compute에서 버킷 조회·업로드·조회·중복 차단·삭제 실검증 성공 |
| 같은 실행일 재실행 | Raw 두 소스 모두 `created: false` 확인 |
| 빈 재고 fixture 실패 분기 | `validate_raw_quality` 실패, DAG 실패 종료코드 1 |
| 품질 실패 후 Curated 실행 | 두 Curated 태스크 모두 차단됨 |

## 보안 확인

- `SEOUL_OPEN_API_KEY`와 `KMA_SERVICE_KEY`는 환경변수 이름만 있습니다.
- `.env.example`에는 실제 값이 없습니다.
- 코드, fixture, 테스트 출력과 문서에 키·토큰·개인정보를 기록하지 않았습니다.
- Compose의 Airflow·PostgreSQL 기본 계정은 로컬 개발용이며 운영에 사용하지 않습니다.

## 후속 작업

- DATA-2.1 승인 결과의 실제 Curated 함수 연결
- 기상청 과거자료 계약 확정 후 실시간 Curated 열과 동일하게 표준화
- 서울 대여소 좌표를 기상청 격자로 묶는 위치 매핑 확장
- OCI 서버 정식 Airflow 배포
- 모델 artifact와 예측 결과 계약 승인 후 예측 태스크 추가
- PostgreSQL에는 검증을 통과한 최신 서비스 결과만 게시
- 운영 IAM, 비밀정보, 재시도·알림·보존 정책 확정
