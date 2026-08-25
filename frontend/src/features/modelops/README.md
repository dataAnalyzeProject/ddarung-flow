# EXP-FE-4.3 관리자 ModelOps UI 컴포넌트

관리자 화면에서 AI 예측 모델의 생애주기, 성능 메트릭, 승격 게이트 검증 결과 및 승격 이력을 확인하고 안전하게 제어(검증, 승인, 반려, 운영 배포, 롤백)할 수 있는 독립 UI 컴포넌트입니다.

---

## 📌 컴포넌트 Props 규격 (Contract)

```typescript
interface ModelOpsPageProps {
  // 1. 화면 상태 (기본값: 'success')
  status?: 'loading' | 'success' | 'empty' | 'error' | 'forbidden';

  // 2. 모델 데이터 배열 (기본값: [])
  models?: Array<{
    modelId: string;
    version: string;
    state: 'DRAFT' | 'VALIDATED' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'RETIRED';
    metrics?: {
      brier?: number;
      shortageRecall?: number;
      freshness?: string;
    };
    promotionGate?: {
      passed: boolean;
      reasonCodes?: string[];
    };
    history?: Array<{
      timestamp: string;
      action: string;
      fromState: string;
      toState: string;
      actor: string;
    }>;
  }>;

  // 3. 현재 진행 중인 액션 (동일 액션의 중복 클릭 방지)
  pendingAction?: null | {
    modelId: string;
    type: 'validate' | 'approve' | 'reject' | 'activate' | 'rollback';
  };

  // 4. 액션 실행 콜백 (확인 Dialog에서 확인 시 1회 호출)
  onAction?: (payload: {
    modelId: string;
    type: 'validate' | 'approve' | 'reject' | 'activate' | 'rollback';
  }) => void;

  // 5. 오류 화면 재시도 콜백
  onRetry?: () => void;
}
```

---

## 🖥️ 화면 구성 및 상호작용

1. **5대 상태 화면**:
   - `loading`: 접근성(`aria-busy="true"`, `role="progressbar"`)을 갖춘 스피너 표시
   - `forbidden`: 403 관리자 권한 필요 안내
   - `error`: 오류 안내 및 `onRetry()` 재시도 버튼 제공
   - `empty`: 등록된 모델 없음 안내
   - `success`: 모델 관리 대시보드 (3대 탭) 렌더링

2. **3대 탭 화면**:
   - **모델 목록 탭**: 모델 버전, 상태 태그, Brier Score, 부족 재현율(Recall), 최신성, 승격 게이트 통과 여부 및 상세 바로가기 제공
   - **상세 메트릭 탭**: 모델 선택 드롭다운, 3대 핵심 메트릭 카드, 승격 게이트 사유 코드 목록, 5대 제어 액션 버튼 바
   - **승격 이력 탭**: 전체 모델의 이력을 최신 시간순(내림차순)으로 정렬하여 타임라인 형태로 표시 (이력 없을 시 안내 문구 표출)

3. **5대 모델 제어 액션 & 확인 다이얼로그 (Action Dialog)**:
   - 지원 액션: `validate` (검증 실행), `approve` (승인), `reject` (반려), `activate` (운영 배포), `rollback` (롤백)
   - 액션 버튼 클릭 시 확인 다이얼로그가 열리며, **확인 및 실행 클릭 시에만 `onAction({ modelId, type })`가 1회 전달**됩니다. 취소 시에는 콜백이 호출되지 않습니다.
   - `pendingAction` 상태인 경우 해당 버튼은 `처리 중...` 라벨과 함께 비활성화(`disabled`)되어 연타 및 중복 호출을 원천 차단합니다.

---

## 📦 Fixture 및 한계 (Limitations)

- **위치**: `frontend/src/features/modelops/data/modelOpsFixture.js`
- **제공 데이터**:
  - `MODEL_STATES`: 6대 모델 상태 상수 규격
  - `modelOpsFixture`: 4종의 실감형 모델 데이터 (ACTIVE, APPROVED, DRAFT, RETIRED)
  - `modelOpsStatusFixtures`: 5대 상태 화면(`loading`, `success`, `empty`, `error`, `forbidden`) 테스트 세트
- **한계**:
  - 본 컴포넌트는 실제 서버 API 호출, 사용자 권한 판정, OCI/Docker 인프라 제어, 실제 모델 가중치 파일(Artifact) 다운로드 등을 직접 수행하지 않습니다.
  - 공개된 Props 인터페이스와 Mock Fixture 및 Callback에만 의존하는 순수 프리젠테이션 컴포넌트입니다.

---

## 🧪 테스트 실행 방법

```bash
# ModelOps 단위 및 계약 정밀 테스트 실행
npm test -- --testPathPattern=ModelOpsPage.test.jsx --watchAll=false

# 전체 프론트엔드 테스트 스위트 실행
npm test -- --watchAll=false
```

---

## 🤝 조장(Lead) 통합 가이드

1. **라우팅 연동**:
   - 관리자 라우터에 `ModelOpsPage`를 등록하고, React Query 또는 SWR을 통해 백엔드 ModelOps API 응답 데이터를 `models` prop으로 주입합니다.
2. **API Mutation 연동**:
   - `onAction` 콜백을 백엔드 승격 API(`/api/admin/models/{modelId}/{action}`) 뮤테이션과 연결합니다.
   - 뮤테이션 진행 중에는 `pendingAction={{ modelId, type }}`를 넘겨주어 UI 레벨의 중복 요청을 방지합니다.
3. **에러 핸들링**:
   - API 에러 발생 시 `status="error"`와 `onRetry={refetch}`를 전달하여 안정적인 복구 흐름을 구성합니다.
