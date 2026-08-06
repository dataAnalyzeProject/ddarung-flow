# DATA-2.0 공개 증거 검증 로그

- 실행일: 2026-08-06
- 실행 주체: 조장 보강
- 브랜치: `codex/data-source-audit`
- 원본 데이터 재다운로드: 이 검증 단계에서는 수행하지 않음

## 소형 증거 무결성 검증

```powershell
.\.local-harness\.venv-week2\Scripts\python.exe -m unittest pipeline.tests.test_data_source_audit_evidence -v
```

결과: `10 tests, OK`

검증 항목:

1. 공식 분기 16개와 CSV 60개 SHA-256 manifest 존재
2. 공개 파일에 개인 PC 절대경로 없음
3. 파일별 행 수 합계와 연도별 합계 일치
4. H1~H4의 `base = matched + missing` 및 비율 0~100%
5. 필요 수량 1~5대 분모가 각 horizon의 미래 관측 성공 분자와 일치
6. 후보 4개 모두 `approved=false`

## 파이프라인 회귀 검증

```powershell
.\.local-harness\.venv-week2\Scripts\python.exe -m pytest pipeline\tests -q --basetemp .local-harness\tmp\week2-data20-pytest
```

결과: `33 passed`

이 로그는 DATA-2.0 증거와 기존 파이프라인 테스트가 함께 통과했음을 기록합니다. 원본부터의 재생성은 공식 파일 SHA-256 대조가 선행되어야 하며, 데이터 계약의 `approved=true` 승인을 의미하지 않습니다.
