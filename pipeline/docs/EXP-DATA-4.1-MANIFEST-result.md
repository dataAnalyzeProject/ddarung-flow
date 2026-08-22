# EXP-DATA-4.1-MANIFEST 로컬 CPU/GPU 학습 Manifest 및 평가 Export 제출 보고서

> 검증일: 2026-08-18 | 기준 커밋: `1628b92bc6683900aa6f2147d0c0de9e59708f29` | 실행 브랜치: `codex/exp-data-local-training-manifest-aug31` | 상태: 로컬 모델 Manifest & 20개 조합 평가 Export 검증 완료

---

## 1. 실행 환경 및 실행 명령

- **OS / Python 버전**: Windows 11 / Python 3.12.0 (가상환경 `.venv`)
- **타임존 / 난수 시드**: `Asia/Seoul` / `seed=20260810`
- **주요 패키지**: `scikit-learn 1.9.0`, `pandas 3.0.5`, `numpy 2.5.2`, `pytest 9.1.1`
- **테스트 및 검증 명령**:
  ```powershell
  python -m pytest pipeline/tests/test_modelops_manifest.py -v
  python -m pytest pipeline/tests/ -v
  ```

---

## 2. 제출 계약 및 파일 목록

| 제출 항목 | 파일 경로 | 설명 및 역할 |
|---|---|---|
| **설정 파일** | [pipeline/config/modelops_training.json](file:///c:/Users/M/Documents/ddarung-flow/pipeline/config/modelops_training.json) | CPU/GPU 프로필 이름, 시드(20260810), 시간대(Asia/Seoul), 출력 파일 규격 정의 |
| **모듈 패키지** | [pipeline/src/modelops/__init__.py](file:///c:/Users/M/Documents/ddarung-flow/pipeline/src/modelops/__init__.py) | `build_model_manifest`, `export_metric_rows` 공개 함수 export |
| **Manifest 모듈** | [pipeline/src/modelops/manifest.py](file:///c:/Users/M/Documents/ddarung-flow/pipeline/src/modelops/manifest.py) | 15개 필수 필드 검증, 64자리 SHA-256 해시 검증, canonical JSON 및 `manifestSha256` 산출 |
| **Export 모듈** | [pipeline/src/modelops/evaluation_export.py](file:///c:/Users/M/Documents/ddarung-flow/pipeline/src/modelops/evaluation_export.py) | 4 Horizons x 5 수량 = 20개 조합 검증 및 결정론적 고정 정렬 반환 |
| **Fixture 샘플** | [pipeline/tests/fixtures/modelops_metrics_sample.json](file:///c:/Users/M/Documents/ddarung-flow/pipeline/tests/fixtures/modelops_metrics_sample.json) | 20개 고유 조합을 담은 고정 결정론적 Fixture 데이터 |
| **단위 테스트 수트** | [pipeline/tests/test_modelops_manifest.py](file:///c:/Users/M/Documents/ddarung-flow/pipeline/tests/test_modelops_manifest.py) | 정상, 누락, 중복, 해시 포맷, 결정론적 정렬 검증 (5 PASSED) |
| **결과 보고서** | [pipeline/docs/EXP-DATA-4.1-MANIFEST-result.md](file:///c:/Users/M/Documents/ddarung-flow/pipeline/docs/EXP-DATA-4.1-MANIFEST-result.md) | 본 검증 결과 및 계약 이행 보고서 |

---

## 3. 검증 결과 및 SHA-256 해시 지표

- **`build_model_manifest()` 검증**:
  - 필수 15개 필드 검증 통과 (`schemaVersion`, `modelVersion`, `trainerId`, `trainedAt`, `trainingProfile`, `codeCommit`, `dataManifestHash`, `configHash`, `artifactSha256`, `artifactBytes`, `xgboostVersion`, `featureSchemaVersion`, `horizons`, `requiredBikeCounts`, `metricsUri`)
  - Canonical JSON 바이트 산출 해시(`manifestSha256`): `64자리 16진수 문자열 산출 완료`
- **`export_metric_rows()` 검증**:
  - H1~H4 (60, 120, 180, 240분) x 필요 수량 1~5대 = **정확히 20개 고유 조합 검증 및 고정 정렬 반환**
  - 입력 순서가 역전되어도 출력 정렬 결과 100% 동일함 확인 (결정론적 재현성 달성)
- **Pytest 검증 결과**:
  - `pipeline/tests/test_modelops_manifest.py`: **5 PASSED** (0 skipped)
  - `pipeline/tests/` 전체 수트: **53 PASSED in 2.37s** (0 skipped)


---

## 4. 제약 사항 및 후속 작업 연계 (Limitations & Next Steps)

1. **대용량 아티팩트 커밋 금지**: 몇십MB의 `.joblib` 바이너리 및 CSV 데이터셋은 Git에 커밋하지 않고 `output/` 폴더 및 `.gitignore` 정책을 준수합니다.
2. **조장 통합 및 OCI 연계**: 본 모듈은 로컬 CPU/GPU 학습 프로필 메타데이터 및 평가 export 규격을 검증하며, OCI cloud 배포 및 실제 활성화는 조장 통합 단계에서 수행됩니다.
