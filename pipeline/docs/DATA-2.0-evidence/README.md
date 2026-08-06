# DATA-2.0 공개 검증 증거

이 디렉터리는 2026-08-06 조장 독립검증에서 생성된 소형 결과만 보관합니다. 원본 ZIP·CSV, 개인 PC 경로, DuckDB 작업 DB는 포함하지 않습니다.

## 작성 주체와 적용 범위

- 황준형 원 제출: `pipeline/src/data_source_audit.py`, 기존 `DATA-2.0-result.md`와 PR #25
- 조장 보강: 이 디렉터리의 증거, `DATA-2.0-leader-independent-audit.md`, 무결성 테스트
- 이 증거는 황준형의 기존 기여를 대체하거나 조장 기여로 재표기하지 않습니다.
- 모든 후보는 조장 승인 전이며 `candidate_manifest.csv`의 `approved=false`를 유지합니다.

## 파일 설명

| 파일 | 내용 |
|---|---|
| `official_catalog.csv` | OA-22382 공식 분기 원본 16개의 출처 페이지와 다운로드 요청 정보 |
| `archive_manifest.csv` | ZIP·CSV 크기, SHA-256, ZIP 무결성, 상대경로 |
| `file_profile.csv` | CSV 60개의 기간, 원본 행, 대여소·시간 키·충돌 건수 |
| `file_candidate_manifest.csv` | CSV 60개의 상대경로·SHA-256·추천 여부·`approved=false` |
| `schema_diff.csv` | 파일별 인코딩, 헤더와 논리 열 수 |
| `duplicate_conflict_summary.csv` | 동일 시간 키 반복과 서로 다른 값 충돌 상세 |
| `year_comparison.csv` | 연도별 범위·행·0대·누락·음수·충돌 요약 |
| `horizon_availability.csv` | 연도별 H1~H4 분자·분모와 미래 관측 누락 |
| `required_bike_distribution.csv` | H1~H4별 필요 수량 1~5대 성공 건수·분모 |
| `candidate_manifest.csv` | 연도별 기술 판정과 승인 전 상태 |
| `station_coverage.csv` | 연도별 대여소 기준정보 결합 분자·분모·비율과 2025 공통 대여소 비율 |

## 산출 방법

1. 서울 열린데이터광장 OA-22382 분기 ZIP 16개를 별도 폴더에 다운로드했습니다.
2. ZIP CRC와 SHA-256을 검증하고 CSV 60개를 읽었습니다.
3. 논리 관측 키를 `연도 + 관측시각 + 대여소 번호`로 통일했습니다.
4. 동일 키·동일 값 반복과 동일 키·서로 다른 값 충돌을 분리했습니다.
5. 서로 다른 값이 충돌하지 않는 시간 키만 H1~H4와 필요 수량 1~5 계산에 사용했습니다.
6. 같은 입력으로 재실행해 핵심 결과가 동일한지 확인했습니다.

## 검증 명령

저장소 루트에서 별도 외부 라이브러리 없이 실행합니다.

```powershell
python -m unittest pipeline.tests.test_data_source_audit_evidence -v
```

이 테스트는 원본 데이터를 다시 내려받지 않습니다. 공개 증거의 행 수, 해시 형식, 상대경로, 산술 관계, 연도별 합계, 100% 이하 비율, `approved=false`를 검증합니다. 원본부터 완전히 재생성하려면 `official_catalog.csv`의 공식 출처에서 동일 파일을 받은 뒤 `archive_manifest.csv`의 SHA-256과 먼저 대조해야 합니다.

## 공식 원본에서 다시 생성

분기 ZIP을 해제한 입력 폴더와 대여소 기준정보 JSON을 준비한 뒤 실행합니다. 개인 절대경로는 문서나 결과에 저장되지 않습니다.

```powershell
python pipeline/src/data20_official_audit.py `
  --input-dir "<OA-22382 CSV 60개 해제 폴더>" `
  --archive-dir "<OA-22382 분기 ZIP 16개 폴더>" `
  --official-catalog "pipeline/docs/DATA-2.0-evidence/official_catalog.csv" `
  --station-master "<대여소 기준정보 JSON>" `
  --output-dir "<새 evidence 출력 폴더>" `
  --work-dir "<임시 작업 폴더>"
```

재생성 코드는 CP949·UTF-8 파일을 표준 열로 변환하고, 파일별 0대·누락·음수·중복·충돌을 계산한 뒤 충돌 없는 시간 키로 H1~H4·1~5대 분포와 대여소 결합률을 다시 만듭니다. 입력 CSV가 60개가 아니면 실패합니다.

## 제한사항

- `missing_count=0`은 읽은 원본에서 파싱 실패 또는 빈 재고값이 검출되지 않았다는 뜻이며 현실의 실제 재고가 정확하다는 보증은 아닙니다.
- 2022년 코로나19의 인과효과는 이 검증으로 판정하지 않습니다.
- 2024년 충돌 격리 범위와 2025년 holdout 기간은 DATA-2.1 계약에서 조장이 승인합니다.
