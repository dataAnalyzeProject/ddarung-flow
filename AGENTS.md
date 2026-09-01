# 따릉이 프로젝트 작업 지도

이 저장소는 목적지 도착시점의 주변 따릉이 대여 가능성을 `높음·중간·낮음`으로 추천하는 PC 웹 MVP를 만듭니다.

이 파일은 작업 시작 지점입니다. 로컬 운영 환경에서는 `.local-harness/docs/team-project-rules.md`의 상세 팀 규칙도 따릅니다.

## 1. 작업 전 필수 확인

사용자 요청을 받으면 먼저 사용 가능한 request-routing 지침으로 프로젝트 관련성, 질문/작업, 단순/복잡을 분류합니다. 프로젝트와 무관한 간단한 질문은 아래 하네스 절차를 적용하지 않습니다. 프로젝트 관련 질문은 필요한 로컬·GitHub·Notion 근거를 확인하고, 복잡한 요청은 결과를 바꾸는 사용자 선택을 먼저 확정합니다.

다음 순서로 확인합니다.

1. 현재 Notion TASK의 속성·본문·선행 게이트를 확인합니다.
2. 로컬 하네스가 있으면 현재 주차와 상세 팀 규칙을 확인합니다.
3. 저장소 아키텍처에서 수정 대상 영역과 경계를 확인합니다.
4. 승인된 작업 계약이 있는지 확인합니다.
5. 작업 계약의 허용 경로, 금지 경로, 검증 명령과 증거 항목을 확인합니다.

승인된 작업 계약이 없으면 실제 구현을 시작하지 않습니다.

**Notion 우선 원칙:** 로컬 상태 파일은 Notion의 미러·캐시일 뿐입니다. 작업 상태(완료 여부, 담당자, 마감, 차단 사유)를 확인·보고·판단할 때는 반드시 Notion 원본을 먼저 직접 조회합니다. 특정 담당자·영역의 현황은 상태 필터 없이 전체를 조회한 뒤 정리합니다. 로컬 상태와 Notion이 다르면 Notion이 이깁니다.

## 2. 기술 스택과 영역

| 영역 | 기술 | 경로 |
|---|---|---|
| 프론트엔드 | Create React App, React, JavaScript/JSX | `frontend/` |
| 백엔드 | Java 21, Spring Boot, PostgreSQL | `backend/` |
| 데이터 | Python, pytest, Airflow | `pipeline/` |
| 인프라 | Docker Compose, Airflow, PostgreSQL | `infra/` |
| 설계 문서 | 승인된 프로젝트 문서 | `docs/` |
| 로컬 하네스 | 상태, 작업 계약, 검증, 증거 | `.local-harness/` |

## 3. 주차 게이트

- 현재 주차는 완료되지 않은 가장 이른 주차입니다.
- 날짜가 다음 주로 넘어가도 이전 주차 증거가 없으면 다음 주차를 시작하지 않습니다.
- 구현이 이미 존재한다는 사실만으로 주차 게이트를 통과하지 않습니다.
- 완료 상태에는 실제 증거 경로와 조장 판정이 필요합니다.
- 다음 주차 작업을 앞당기려면 일정 이동 절차와 조장 승인이 필요합니다.

## 4. 역할 경계

- 조장: 요구사항, 계획, 아키텍처, ERD, API 계약, 보안, 통합과 최종 승인
- 데이터 담당: 데이터 품질, 타깃, 피처, 시간순 분할, 기준선과 모델 평가
- 비전공자 담당: 승인된 작업서의 허용 파일만 구현하고 검증·증거 제출

비전공자 작업에는 보안 설정, 실제 OAuth 키 관리, 계약 변경, 모델 결정, 공통 통합을 넣지 않습니다.

## 5. 변경 규칙

- 작업 계약의 허용 경로만 수정합니다.
- 범위 밖 파일이 필요하면 수정하지 않고 조장에게 요청합니다.
- 승인된 API, 데이터, 보안, 아키텍처 계약을 임의로 변경하지 않습니다.
- 관련 없는 코드, 문서, 형식은 정리하거나 리팩터링하지 않습니다.
- 실제 비밀값, 토큰, OAuth 키, 개인정보를 코드·로그·캡처에 남기지 않습니다.
- `.env`와 `.local-harness/`는 커밋하지 않습니다.

## 6. 기본 검증 명령

프론트엔드:

```powershell
cd frontend
npm test -- --watchAll=false
npm run build
```

백엔드:

```powershell
cd backend
.\gradlew.bat test
```

파이프라인:

```powershell
.\.venv\Scripts\python.exe -m pytest pipeline\tests -q
```

작업 계약에 더 좁거나 추가된 검증 명령이 있으면 해당 명령을 우선 적용합니다.

## 7. 완료와 제출

- 테스트·빌드·실행 결과 없이 완료로 표시하지 않습니다.
- 실패한 항목은 성공으로 기록하지 않습니다.
- 코드 작업은 변경 파일, 실행 명령, 결과와 PR 링크를 제출합니다.
- 화면 작업은 상태별 캡처를 제출합니다.
- DB 작업은 DB명, 테이블과 쿼리 또는 테스트 결과를 제출합니다.
- 현재 TASK가 병합 권한을 명시하지 않으면 담당자는 PR을 직접 병합하지 않습니다.
- 조장 검토 전 상태는 `검토 요청`이며 최종 완료가 아닙니다.
- Notion 작업 페이지에는 현재 계약의 담당자 제출 결과 형식을 사용합니다.

## 8. 로컬 하네스 비공개 규칙

- `.local-harness/`의 상태·증거·내부 운영 파일은 로컬 전용입니다.
- 로컬 하네스 파일을 Git 커밋, 푸시, GitHub PR에 포함하지 않습니다.
- 하네스 상태와 증거를 공개 저장소 파일로 복사하지 않습니다.
- 이 공개 `AGENTS.md`와 `docs/codex/**` protocol은 TASK-304가 승인한 저장소 지침이며 로컬 하네스 데이터가 아닙니다.

## 9. 팀 작업 평가 하네스

- 사용자가 `팀 작업 평가`, `평가 하네스`, `검증 에이전트`로 평가를 요청하면 사용 가능한 팀 평가 하네스를 따릅니다.
- 평가는 Notion 작업 계약과 GitHub 브랜치·PR·제출 파일을 함께 대조합니다.
- 평가용 서브 에이전트는 읽기 전용으로 실행하며 코드, Notion, 브랜치와 PR을 수정하지 않습니다.
- 서브 에이전트의 판정은 교차 검토 의견이며 자체로 상태를 바꾸거나 최종 승인하지 않습니다.
- 부모 평가 컨트롤러만 승인된 범위에서 평가 댓글과 검토 상태를 반영할 수 있습니다.
- 담당자 피드백은 비전공자가 혼자 따라 할 수 있도록 쉬운 용어, 정확한 파일, 단계별 수정·검증·제출 방법으로 작성합니다.

## 10. Codex 실행 router

상세 lifecycle을 이 파일에 중복하지 않습니다.

1. 기본 lifecycle: [`docs/codex/EXECUTION_HARNESS_R1.md`](docs/codex/EXECUTION_HARNESS_R1.md)
2. 역할별 모델과 escalation ceiling: [`docs/codex/MODEL_ROUTING_R1.md`](docs/codex/MODEL_ROUTING_R1.md)
3. Consumer frontend 작업: [`docs/codex/FE_VISUAL_PROTOCOL_R1.md`](docs/codex/FE_VISUAL_PROTOCOL_R1.md) + [`docs/codex/ASSET_PROTOCOL_R1.md`](docs/codex/ASSET_PROTOCOL_R1.md)

현재 Notion TASK와 그 TASK가 참조하는 frozen contract가 범위·행동의 source of truth입니다. 더 구체적이고 더 최신인 TASK 규칙은 generic harness보다 우선합니다. GitHub는 branch, commit, PR, CI, merge, deployment의 실제 사실을 소유합니다. 모델·테스트·CI·Staging·브라우저·승인 결과는 실제 관측 없이 주장하지 않습니다.
