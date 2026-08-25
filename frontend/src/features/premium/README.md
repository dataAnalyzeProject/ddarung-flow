# EXP-FE-3.6-PREMIUM 프리미엄 구독 샌드박스 UI 및 독립 실행 테스트

## 🔗 PR 및 제출 정보

- **PR 링크**: https://github.com/dataAnalyzeProject/ddarung-flow/pull/78
- **작성자 / 담당**: Frontend Developer
- **작업 브랜치**: `codex/exp-fe-premium-sandbox-ui`

---

## 📁 변경 파일 및 파일별 구현 내용

### 1. `PremiumSandboxPage.jsx`

- **역할**: 프리미엄 구독 결제 샌드박스 전용 순수 Presentational UI 컴포넌트.
- **구현 내용**:
  - 자체 Header/nav/로그인 UI를 완전히 배제하고 본문(`<main className="premium-sandbox">`)만 렌더링하도록 조장 통합 계약 준수.
  - 와이어프레임 1:1 대조 좌측(테스트 상품 정보 박스, 상태별 정확한 주 버튼 문구, 힌트 안내문) 및 우측(6개 상태별 상세 안내, 실시간 callback 호출 카운트 관찰기) 2열 Layout 복원.
  - 6가지 상태(`PREPARING`, `PROCESSING`, `SUCCESS`, `CANCELLED`, `FAILED`, `PAYMENT_NOT_ENABLED`) 단일 조건부 렌더링 및 `SANDBOX TEST · 실제 결제 없음` 안전 배지 상시 노출.
  - 결과 상태(`SUCCESS`, `CANCELLED`, `FAILED`) 진입 시 `lastReportedStatusRef`를 활용하여 리렌더링 중복 없이 정확히 1회 안전하게 `onCallbackResult` 호출 연동.
  - 실시간 callback 카운트 상태(`callbackCounts`) 및 4대 콜백 인자 바인딩.

### 2. `PremiumSandboxPage.css`

- **역할**: 샌드박스 전용 유연 반응형 디자인 시스템.
- **구현 내용**:
  - 네임스페이스 격리 `.premium-sandbox*` 전용 클래스로 전역 CSS 오염 100% 방지.
  - 데스크톱(1440px) 유연 확장(2열 Grid 50:50) 및 모바일(620px 이하) 가로 스크롤바 없는 세로 1열 자동 반응형 전환.
  - 파란색 포인트 바 상품/상태 정보 박스, disabled 버튼, monospace callback 카운트 관찰기 스타일링.

### 3. `PremiumSandboxPage.test.jsx`

- **역할**: RTL / Jest 기반 독립 단위 테스트 수트.
- **수정한 테스트**:
  1. `renders SANDBOX TEST banner on all 6 statuses`: 6가지 전 상태 필수 배지 상시 노출 검증.
  2. `renders all 6 payment statuses correctly`: 6가지 상태별 타이틀, 버튼 문구(`sandbox checkout 시작`, `구독 상태 새로고침` 등), disabled, subscription 데이터 및 우측 상태 카드 렌더링 검증.
  3. `calls onCheckout, onCallbackResult, onRefreshSubscription, and onRetry callbacks correctly`: 버튼 액션 및 결과 상태 진입에 따른 4대 콜백 호출 횟수 단정 (FAILED 상태 포함 및 `onCallbackResult` 3회 누적 수신 검증).
  4. `prevents duplicate clicks during PROCESSING status`: `PROCESSING` 중 버튼 disabled 및 중복 클릭 방지 검증.
  5. `결제정보 입력 필드 및 외부 PG SDK / URL 링크가 렌더링되지 않는지 검사한다.`: 입력창 및 외부 PG SDK 미존재 보안 검증.

### 4. `README.md`

- **역할**: 모듈 구성 설명, 보안 한계 기록, 콜백 설계 정책, 전체 단위 테스트/빌드 실행 방법 및 CI 결과 명세서.

---

## 📌 주요 설계 결정 및 콜백 동작 정책 (`onCallbackResult`)

- **결과 알림 콜백 정책**: `onCallbackResult`는 버튼 클릭 이벤트가 아닌, checkout 흐름의 결과 상태(`SUCCESS`, `CANCELLED`, `FAILED`)에 도달했음을 상위 컴포넌트/테스터에 알리는 결과 수신용 콜백입니다.
- **호출 시점 및 중복 방지**: `lastReportedStatusRef`를 활용하여 동일한 결과 상태당 최초 1회만 안전하게 호출되며, 불필요한 리렌더링에 의한 중복 호출을 원천 차단하도록 구현되었습니다.

---

## 🔒 보안 및 Fixture 한계사항 기록 (안전성 증명)

1. **실제 결제 수단 미포함**: 카드번호, CVC, 계좌번호 등 실제 결제 수단을 입력받는 `<input>` 필드가 일절 존재하지 않음.
2. **외부 PG SDK / URL 미포함**: TossPayments / Iamport 등 외부 PG 연동 스크립트 및 외부 결제창 리다이렉트(`window.location`, `href`)가 전혀 포함되지 않음.
3. **비밀값 미포함**: PG Client Secret Key 등 보안 민감값이 포함되지 않으며 백엔드 API 연동 없는 순수 Mock 시뮬레이션으로 동작함.

---

## 🧪 테스트 및 빌드 실행 검증 결과 (CI 증빙)

### 1. 프리미엄 샌드박스 단위 테스트 (`PremiumSandboxPage.test.jsx`)

```bash
npm test -- --testPathPattern=PremiumSandboxPage.test.jsx --watchAll=false
```

```text
PASS  src/features/premium/PremiumSandboxPage.test.jsx
  ✓ renders SANDBOX TEST banner on all 6 statuses (41 ms)
  ✓ renders all 6 payment statuses correctly (70 ms)
  ✓ calls onCheckout, onCallbackResult, onRefreshSubscription, and onRetry callbacks correctly (33 ms)
  ✓ prevents duplicate clicks during PROCESSING status (8 ms)
  ✓ 결제정보 입력 필드 및 외부 PG SDK / URL 링크가 렌더링되지 않는지 검사한다. (5 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.404 s
```

### 2. 전체 프론트엔드 테스트 (`All 10 Test Suites`)

```bash
npm test -- --watchAll=false
```

```text
PASS src/features/login/loginStorage.test.js
PASS src/features/premium/PremiumSandboxPage.test.jsx
PASS src/features/riding-guide/RidingGuidePage.test.jsx
PASS src/App.test.jsx
PASS src/features/weather/WeatherCard.test.jsx
PASS src/features/intro/IntroPage.test.jsx
PASS src/features/login/LoginPage.test.jsx
PASS src/features/prediction-results/PredictionResults.test.jsx
PASS src/features/place-search/PlaceStationSearchPage.test.jsx
PASS src/features/main/MainPage.test.jsx

Test Suites: 10 passed, 10 total
Tests:       84 passed, 84 total
Snapshots:   0 total
Time:        4.015 s
Ran all test suites.
```

### 3. 프로덕션 빌드 (`npm run build`)

```text
Creating an optimized production build...
Compiled successfully.

File sizes after gzip:
  59.31 kB  build\static\js\main.57be4603.js
  14.81 kB  build\static\css\main.11cfb6c2.css
  1.77 kB   build\static\js\453.782f0a85.chunk.js
```

### 4. Git 공백 검사 (`git diff --check`)

```bash
git diff --check
```

```text
C:\Users\M\Documents\GitHub\ddarung-flow>"C:\Program Files\Git\cmd\git.exe" diff --check
warning: in the working copy of 'frontend/src/features/premium/PremiumSandboxPage.jsx', LF will be replaced by CRLF the next time Git touches it

C:\Users\M\Documents\GitHub\ddarung-flow>
```

> Trailing whitespace(끝 공백) 에러 출력 없이 100% 정상 통과.

# [EXP-FE-5.4-UI] 프리미엄 가이드 접근 fixture UI

## 🔗 모듈 개요

- **컴포넌트**: `PremiumGuideAccessPanel`
- **목적**: 실제 결제나 서버 연결 없이, 프리미엄 라이딩 가이드의 접근 상태(`accessState`)와 요금제 안내를 Props와 Fixture만으로 보여주는 독립 Presentational React 컴포넌트입니다.

---

## 🧩 Props 및 인터페이스 명세

| Prop 이름      | 타입       | 기본값                | 설명                                                                      |
| :------------- | :--------- | :-------------------- | :------------------------------------------------------------------------ |
| `accessState`  | `string`   | `'FREE'`              | 사용자의 접근 상태 (`'ANONYMOUS'`, `'FREE'`, `'EXPIRED'`, `'PROCESSING'`) |
| `onLogin`      | `function` | `undefined`           | 비로그인(`ANONYMOUS`) 상태에서 '로그인하고 계속' 클릭 시 호출되는 콜백    |
| `onSelectPlan` | `function` | `undefined`           | 요금제 선택 시 호출되는 콜백 (`{ planCode: "..." }` 인자 전달)            |
| `plans`        | `Array`    | `premiumPlansFixture` | 표시할 프리미엄 요금제 목록 데이터 배열                                   |

---

## 🚦 상태별(`accessState`) 동작 및 화면 정의

| `accessState`    | 화면 렌더링 내용                                       | 버튼 동작 및 콜백                                                           |
| :--------------- | :----------------------------------------------------- | :-------------------------------------------------------------------------- |
| **`ANONYMOUS`**  | 🔒 로그인 후 상세 가이드를 볼 수 있다는 잠금 안내 박스 | `[로그인하고 계속]` 클릭 시 `onLogin()` 1회 호출                            |
| **`FREE`**       | 프리미엄 월간 / 프리미엄 연간 요금제 카드 2장          | `[월간 선택]` / `[연간 선택]` 클릭 시 `onSelectPlan({ planCode })` 1회 호출 |
| **`EXPIRED`**    | 이용 기간 종료 안내 문구 + 요금제 카드 2장             | `[월간 선택]` / `[연간 선택]` 클릭 시 `onSelectPlan({ planCode })` 1회 호출 |
| **`PROCESSING`** | ⏳ 결제 확인 중 안내 문구 + 요금제 카드 2장            | 두 버튼 모두 `disabled` (비활성화) 처리되며 콜백 호출 없음                  |

### 💳 지원 요금제 규격 (`planCode`)

- `PREMIUM_MONTHLY_30D`: 프리미엄 월간 (30일 · 2,900원, 자동 갱신 없음, `월간 선택` 버튼)
- `PREMIUM_YEARLY_365D`: 프리미엄 연간 (365일 · 29,000원, 자동 갱신 없음, `연간 선택` 버튼)

---

## 📁 관련 파일 구성

1. `frontend/src/features/premium/PremiumGuideAccessPanel.jsx`: 순수 Presentational UI 본체 컴포넌트.
2. `frontend/src/features/premium/PremiumGuideAccessPanel.css`: 960px 중앙 정렬, PC 2열 Grid / 모바일 1열 반응형, Tab 포커스 윤곽선 스타일.
3. `frontend/src/features/premium/PremiumGuideAccessPanel.test.jsx`: 4대 상태 렌더링, 요금제 카드 Scoping 검증, 콜백 인자 단정 단위 테스트.
4. `frontend/src/features/premium/data/premiumGuideAccessFixture.js`: 4가지 접근 상태 상수 및 2종 요금제 규격 데이터.
5. `frontend/src/features/premium/README.md`: 컴포넌트 명세 및 테스트 실행 가이드.

---

## 🔒 보안 및 조장 통합 범위 밖 항목 (한계사항 명시)

- **API 및 통신 미사용**: `fetch`, `axios` 등 백엔드 통신을 전혀 사용하지 않으며, Props와 Fixture만으로 동작합니다.
- **브라우저 전역 제어 미사용**: `window.location`, `localStorage` 등을 사용하지 않으며, 전역 라우팅을 조작하지 않습니다.
- **실제 결제·SDK 미포함**: TossPayments / OAuth 등 외부 PG SDK나 실제 결제/환불/정산 로직이 포함되지 않습니다.
- **조장 통합 대상 영역**: `ACTIVE` 사용자의 실제 라이딩 가이드 본문 진입, 로그인 복귀 리다이렉트, 실제 구독 API/Webhook 연동, 사용자 격리 및 보안은 조장 소유의 통합 작업에서 처리됩니다.

---

## 🧪 단위 테스트 실행 가이드 및 결과

```bash
# 프리미엄 가이드 접근 패널 단위 테스트 독립 실행
npm test -- --testPathPattern=PremiumGuideAccessPanel.test.jsx --watchAll=false
테스트 실행 통과 결과 (8/8 PASS 🟢)
text
PASS src/features/premium/PremiumGuideAccessPanel.test.jsx
  PremiumGuideAccessPanel 컴포넌트 단위 테스트
    ✓ ANONYMOUS 상태에서는 잠금 안내를 보여주고 로그인 버튼 클릭 시 onLogin을 1회 호출한다 (74 ms)
    ✓ FREE 상태에서 각 요금제 카드 내부에 해당 플랜의 이름, 가격, 정책문구, 버튼이 정확히 렌더링되고 클릭된다 (35 ms)
    ✓ EXPIRED 상태에서는 이용 기간 종료 안내 문구와 요금제 카드를 함께 렌더링한다 (13 ms)
    ✓ PROCESSING 상태에서는 결제 확인 중 문구가 뜨고 버튼이 disabled되며 콜백이 호출되지 않는다 (19 ms)
    ✓ ANONYMOUS 상태에서 SANDBOX TEST 필수 안전 배지가 상시 노출된다 (3 ms)
    ✓ FREE 상태에서 SANDBOX TEST 필수 안전 배지가 상시 노출된다 (2 ms)
    ✓ EXPIRED 상태에서 SANDBOX TEST 필수 안전 배지가 상시 노출된다 (3 ms)
    ✓ PROCESSING 상태에서 SANDBOX TEST 필수 안전 배지가 상시 노출된다 (2 ms)
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.062 s
```
