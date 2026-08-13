# DATA-OPS-OCI-01 OCI 과거 데이터 적재 결과

## 실행 기준

- 작업 브랜치: `codex/data-ops-oci-01-followup`
- 후속 시작 commit: `1628b92bc6683900aa6f2147d0c0de9e59708f29`
- 승인 manifest SHA-256: `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7`
- 승인 파일: 34개
- 승인 연도: 2022, 2024, 2025
- 승인 Curated SHA-256: `0E5ED94F13E732FA70799681C58CC74801B231E43C9E2D9EDBD480C0BD80A182`
- 승인 Curated 행 수: 66,467,477

## 저장 규칙

- Raw: `raw/bike-inventory/historical/{year}/{approved-file-name}`
- Curated: `curated/bike-inventory/historical/{year}/part-{number}.csv`
- 재실행: `if-none-match=*`
- 동일 SHA-256·크기: 기존 object 재사용
- 다른 SHA-256 또는 크기: 실행 중단, 덮어쓰기 금지
- 재사용 partition: 승인 Curated SHA·행 수와 lineage의 135개 SHA·크기·행 수가 모두 일치할 때만 허용

## 구현 파일

- `pipeline/src/oci_historical_upload.py`: 승인 manifest·Curated lineage 대조, invalid/null 시각 거부, 행 보존, multipart upload, 원격 metadata 검증, 표본 본문 읽기·권한 거부 검증
- `pipeline/tests/test_oci_historical_upload.py`: lineage 불일치·partition 변조·invalid/null 시각·행 보존·multipart·원격 검증 범위 테스트

## 실행 결과

| 항목 | 결과 |
|---|---|
| manifest SHA-256·34개 파일 대조 | PASS |
| Raw 적재 | PASS — 34 objects, 66,560,015 rows |
| Curated lineage | PASS — 승인 원본 SHA·66,467,477행, 135개 partition SHA·크기·행 수 전수 일치 |
| Curated 적재 | PASS — 135 objects, 66,467,477 rows |
| 원격 HEAD metadata SHA-256·크기 대조 | PASS — 169/169 |
| 동일 입력 재실행 | PASS — 신규 0, 재사용 169 |
| 인증 본문 읽기 | PASS — Raw·Curated 표본 2개 본문 SHA-256 일치 |
| 비인증 읽기 | PASS — HTTP 404로 거부 |
| wrapper·기존 OCI 테스트 | PASS — 16 passed |
| 전체 pipeline 회귀 테스트 | PASS — 76 passed |
| secret scan | PASS |
| `git diff --check` | PASS |

169개 전체의 SHA-256 검증 범위는 OCI `HEAD` 응답의 사용자 metadata와 크기다. 본문 스트림 SHA-256 검증은 Raw·Curated 표본 2개에 수행했다. 마스킹된 169개별 별칭·행 수·SHA-256·크기 증거 ID는 `DATA-OPS-OCI-01/followup-object-evidence`이며 로컬 하네스 증거 디렉터리에 보관한다.

## 재현 명령

```powershell
& <approved-python> -m pytest pipeline\tests\test_oci_historical_upload.py pipeline\tests\test_oci_raw_store.py --basetemp=<local-temp-dir> -q
python -m pipeline.src.oci_historical_upload --manifest <approved-manifest> --data-root <approved-data-root> --curated <approved-curated> --partition-dir <new-empty-partition-dir> --dry-run --result-file <masked-lineage-result>
python -m pipeline.src.oci_historical_upload --manifest <approved-manifest> --data-root <approved-data-root> --curated <approved-curated> --partition-dir <approved-partition-dir> --reuse-partitions --bucket <approved-private-bucket> --workers 4 --verify-access --result-file <masked-remote-result>
git diff --check
```

첫 번째 dry-run이 승인 Curated checksum·전체 행 수와 partition별 checksum 목록을 생성한다. 두 번째 실행은 같은 원본과 lineage를 전부 대조하며, 누락·변조·행 수 불일치가 하나라도 있으면 업로드 전에 중단한다.

## 조기 병합 사후 확인

- 원 PR: #71
- merge commit: `1628b92bc6683900aa6f2147d0c0de9e59708f29`
- 병합 당시 상태: Notion 검토 완료 전 조기 병합
- 예외 처리: 되돌리지 않고 최신 main에서 후속 수정 브랜치와 별도 재검토 PR을 사용
- merge commit main CI: PASS — run `31662179207`
- merge commit Staging CD: PASS — run `31662236316`
- 최종 완료: 후속 PR 검토와 승인 전에는 미완료

## 제출 판정

승인 manifest와 Curated lineage, 169개 원격 HEAD metadata, 멱등 재실행, 표본 본문 읽기와 비인증 접근 거부를 확인했다. 169개 전체 본문을 읽었다고 주장하지 않는다. 모델 활성화·예측 게시·운영 배포는 수행하지 않았으며 후속 PR 승인 전까지 다음 작업을 시작하지 않는다.
