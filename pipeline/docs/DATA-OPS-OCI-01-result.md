# DATA-OPS-OCI-01 OCI 과거 데이터 적재 결과

## 실행 기준

- 작업 브랜치: `codex/data-ops-oci-01`
- 시작 commit: `5f6fd15433f862153f8ccea967c164e86885ff61`
- 승인 manifest SHA-256: `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7`
- 승인 파일: 34개
- 승인 연도: 2022, 2024, 2025

## 저장 규칙

- Raw: `raw/bike-inventory/historical/{year}/{approved-file-name}`
- Curated: `curated/bike-inventory/historical/{year}/part-{number}.csv`
- 재실행: `if-none-match=*`
- 동일 SHA-256·크기: 기존 object 재사용
- 다른 SHA-256 또는 크기: 실행 중단, 덮어쓰기 금지

## 구현 파일

- `pipeline/src/oci_historical_upload.py`: 승인 manifest 대조, 서울 시간 기준 연도 파티션, SHA-256·행 수 기록, multipart upload, 기존 object 검증, 읽기·권한 거부 검증
- `pipeline/tests/test_oci_historical_upload.py`: 승인 연도 분리, 범위 밖 연도 거부, immutable write, checksum 일치 재사용 검증

## 실행 결과

| 항목 | 결과 |
|---|---|
| manifest SHA-256·34개 파일 대조 | PASS |
| Raw 적재 | PASS — 34 objects, 66,560,015 rows |
| Curated 적재 | PASS — 135 objects, 66,467,477 rows |
| 전체 원격 SHA-256·크기 대조 | PASS — 169/169 |
| 동일 입력 재실행 | PASS — 신규 0, 재사용 169 |
| 인증 읽기 | PASS — Raw·Curated 표본 본문 SHA-256 일치 |
| 비인증 읽기 | PASS — HTTP 404로 거부 |
| wrapper·기존 OCI 테스트 | PASS — 9 passed |
| secret scan | PASS |
| `git diff --check` | PASS |

## 재현 명령

```powershell
python -m pytest pipeline/tests/test_oci_historical_upload.py pipeline/tests/test_oci_raw_store.py -q
python -m pipeline.src.oci_historical_upload --manifest <approved-manifest> --data-root <approved-data-root> --curated <approved-curated> --partition-dir <approved-partition-dir> --reuse-partitions --bucket <approved-private-bucket> --workers 4 --verify-access --result-file <local-evidence-file>
git diff --check
```

## 제출 판정

승인 manifest 범위의 실제 OCI 적재, 전체 object 대조, 멱등 재실행, 인증 읽기와 비인증 접근 거부, secret scan을 확인했다. 모델 활성화·예측 게시·운영 배포는 수행하지 않았으며 후속 승인 작업으로 유지한다. 이 결과는 조장 검토를 요청할 수 있는 제출 상태다.
