# DATA-OPS-OCI-01 OCI 데이터 적재 준비 결과

## 실행 기준

- 작업 브랜치: `codex/data-ops-oci-01`
- 시작 commit: `5f6fd15433f862153f8ccea967c164e86885ff61`
- 승인 manifest SHA-256: `9075B4EFA89D7370DAB8006BB44579F5F9B215511F16A64AE0B007955FADA9C7`
- 승인 파일 수: 34개
- 승인 연도: 2022, 2024, 2025

## 사전 검증 결과

| 항목 | 결과 |
|---|---|
| 승인 manifest checksum 재검증 | PASS |
| 승인 파일·연도 범위 확인 | PASS |
| Curated 입력 행 수 | 66,467,477 |
| Quarantine 행 수 | 92,538 |
| OCI Object Storage fixture 테스트 | PASS — 4 passed |
| 실제 historical Raw/Curated 업로드 | NOT_RUN |

## 실제 OCI 업로드가 실행되지 않은 이유

기존 OCI preflight는 test object의 접근과 immutable write 동작을 확인하지만, historical Raw/Curated 대상의 승인된 prefix와 Curated 저장 표현을 정의하지 않는다. 승인되지 않은 prefix를 추정하거나 저장 정책을 새로 만들지 않기 위해 업로드를 실행하지 않았다.

실행을 시작하려면 조장이 다음 저장 대상 계약을 문서로 승인해야 한다.

- Raw object prefix
- Curated object prefix
- Curated 전체 파일의 단일 객체 또는 승인된 partition 방식

## 후속 검증

저장 대상 계약이 승인되면 다음 결과를 추가한다.

1. 업로드 전후 파일 수·행 수·SHA-256 대조
2. object key와 manifest 연결
3. 동일 입력 재실행의 중복·덮어쓰기 검증
4. 정상 읽기와 권한 실패 검증
5. 마스킹된 secret scan 및 변경 파일 검사

이 문서는 모델 학습·활성화, 예측 게시, 운영 배포를 수행했다는 의미가 아니다.
