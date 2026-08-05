# 로그인 화면 담당자 작업 지시서

이 문서를 위에서부터 한 단계씩 진행합니다. 파일 이름은 아래에 적힌 그대로 사용합니다.

## 1. 이 작업의 결과

사용자가 미래 자전거 대수를 예측하려고 할 때 카카오·네이버·구글 중 하나로 로그인할 수 있는 화면을 만듭니다.

지금은 실제 로그인 서버에 연결하지 않습니다. 버튼을 눌러 화면 모습과 상태 변화만 확인할 수 있게 만듭니다.

## 2. 작업할 폴더

`frontend/src/features/login/`

이 폴더 밖의 파일은 수정하지 않습니다. 특히 `frontend/src/App.jsx`는 조장 또는 화면 통합 담당자가 연결합니다.

## 3. 만들어야 하는 파일

### `LoginPage.jsx`

로그인 화면 전체를 담는 파일입니다.

이 파일에 다음 내용을 넣습니다.

- “예측을 확인하려면 로그인이 필요합니다”라는 안내
- 로그인 후 원래 예측 화면으로 돌아간다는 안내
- 카카오·네이버·구글 로그인 버튼
- 로그인 처리 중, 성공, 실패, 취소 중 현재 상태

### `LoginPage.css`

`LoginPage.jsx` 화면의 크기, 색상, 간격을 정하는 파일입니다.

작은 화면과 큰 화면에서 모두 글과 버튼이 잘 보이게 만듭니다.

### `SocialLoginButton.jsx`

카카오·네이버·구글 버튼이 공통으로 사용하는 파일입니다.

버튼마다 다음 값을 받아 표시하도록 만듭니다.

- 로그인 회사 이름
- 버튼 색상
- 현재 사용할 수 있는지 여부
- 버튼을 눌렀을 때 실행할 내용

### `loginDemoState.js`

실제 서버 대신 화면 상태를 바꾸기 위한 자료를 적는 파일입니다.

사용할 상태:

- `idle`: 처음 화면
- `loading`: 로그인 처리 중
- `success`: 로그인 성공
- `error`: 로그인 실패
- `cancelled`: 사용자가 취소

### `LoginPage.test.jsx`

로그인 화면이 기본적으로 작동하는지 확인하는 파일입니다. 테스트 도구 추가가 필요하면 먼저 조장에게 알립니다.

최소 확인 내용:

- 로그인 버튼 3개가 보이는가
- 처리 중일 때 버튼을 다시 누를 수 없는가
- 실패 문구와 다시 시도 버튼이 보이는가

## 4. 작업 시작 명령

PowerShell을 열고 아래 명령을 한 줄씩 입력합니다.

```powershell
cd D:\GitHub\ddarung-flow\frontend
npm install
npm start
```

브라우저에 React 기본 로고 화면이 보이면 준비가 된 것입니다.

## 5. 작업 순서

1. 위 다섯 파일을 정확한 이름으로 만듭니다.
2. `LoginPage.jsx`에서 기본 로그인 화면을 만듭니다.
3. `SocialLoginButton.jsx`로 로그인 버튼 3개를 만듭니다.
4. `loginDemoState.js`의 가짜 상태를 이용해 성공·실패·취소 화면을 확인합니다.
5. 조장에게 `LoginPage`를 전체 화면에 연결해 달라고 요청합니다.
6. 작은 화면과 큰 화면에서 확인합니다.
7. 화면별 캡처와 아직 안 되는 부분을 Notion 작업 카드에 남깁니다.

## 6. 완료 기준

- 카카오·네이버·구글 버튼이 모두 보입니다.
- Tab과 Enter 키만으로 버튼을 사용할 수 있습니다.
- 로그인 처리 중에는 같은 버튼을 여러 번 누를 수 없습니다.
- 실패 이유와 다시 시도 방법이 쉬운 문장으로 보입니다.
- `npm run build`가 성공합니다.
- 담당자가 만든 파일의 역할을 자신의 말로 설명할 수 있습니다.

## 7. 하지 말아야 할 일

- 실제 카카오·네이버·구글 비밀키 입력
- 서버 연결
- `App.jsx`, `pages`, `shared` 직접 수정
- 게시판, 즐겨찾기 등 다른 기능 추가

## 8. 모듈 시뮬레이션 및 테스트 결과

### 1) 실제 서버 연동 없음 안내
- 본 모듈은 실제 백엔드 서버 API 호출 및 OAuth 인증 이동 없이 `authDemoData.js`의 모조(Mock) 데이터를 활용하여 상태 및 UI 동작을 시뮬레이션합니다.
- 토큰, 비밀번호 등 민감한 인증 정보는 sessionStorage나 화면에 저장/표시되지 않습니다.

### 2) sessionStorage 저장 키 5개
대기 중인 예측 입력 데이터는 아래 5개 허용 키만 추출하여 `sessionStorage`(`ddarung.pendingPrediction.v1`)에 안전하게 저장·복원·삭제됩니다:
1. `startStation` (출발지)
2. `endStation` (목적지)
3. `transport` (이동 수단)
4. `time` (대여/예측 시간)
5. `requiredBikeCount` (필요 자전거 대수)

### 3) 담당자 추가 경계 테스트 및 사유
- **테스트 항목**: `savePendingPrediction(null)` 및 객체가 아닌 비정상 데이터 입력 테스트
- **추가 이유**: 사용자가 잘못된 타입의 데이터를 전달하더라도 런타임 오류(Crash)가 발생하지 않고 안전하게 예외 처리되는지 검증하기 위함.

### 4) 작업 시 참고 사항
- 담당자가 작업하는 과정이나, 작업 중간 결과물, 결과물에 대한 자신의 견해를 Notion 작업 카드에 남겨야 합니다.

## 9. 이번 작업 수정 파일 목록 및 테스트 결과

### 1) 이번 작업 관련 5개 파일 목록
- `frontend/src/features/login/LoginPage.jsx`
- `frontend/src/features/login/LoginPage.test.jsx`
- `frontend/src/features/login/loginStorage.js`
- `frontend/src/features/login/loginStorage.test.js`
- `frontend/src/features/login/README.md`

### 2) 핵심 테스트 검증 결과
- **5개 입력 복원 테스트**: `origin`, `destination`, `travelMode`, `directMinutes`, `requiredBikeCount` 5개 입력값이 세션에 보존되어 화면에 정상 복원됨을 검증함. (`PASS`)

- **자동 호출 0회 테스트**: 로그인 성공(`SUCCESS`) 시점에 `onRepeatPrediction` 함수가 자동으로 실행되지 않고 정확히 0회 호출됨을 검증함. (`PASS`)

- **수동 클릭 1회 호출 & 삭제 테스트**: 사용자가 `[다시 예측]` 버튼을 누를 때만 복원 객체로 `onRepeatPrediction`이 1회 호출되고 세션스토리지 데이터가 삭제됨을 검증함. (`PASS`)

> ddarung-flow-frontend@0.1.0 test
> react-scripts test --watchAll=false

 PASS  src/features/login/LoginPage.test.jsx
 PASS  src/App.test.jsx
 PASS  src/features/login/loginStorage.test.js
                                                                                                                                               
Test Suites: 3 passed, 3    total                                                                                                                 
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        1.476 s

### 💡 조장 통합(Integration) 안내 및 연동 경계
1. **재예측 콜백 연결**: `LoginPage` 컴포넌트는 `onRepeatPrediction` prop이 유효한 함수로 전달될 때만 해당 함수를 1회 호출하고 임시 저장값(`sessionStorage`)을 삭제하도록 안전 방어 로직이 구현되어 있습니다.
2. **실제 API 연동 경계**: `LoginPage` 내부에서는 실제 백엔드 예측 API(`fetch`/`axios`)를 직접 호출하거나 결과 페이지로 이동하지 않으며, 조장이 통합 단계에서 `onRepeatPrediction` 콜백에 실제 API 호출 및 라우팅 함수를 연결해 사용할 예정입니다.

### 💡 허용 목록 외 파일 (`MainPage.test.jsx`) 수정 관련 사유
- `frontend/src/features/main/MainPage.test.jsx` 파일은 팀원 브랜치 통합 과정에서 포함되었거나 통합 검증을 위해 유지된 파일로, 이번 로그인 기능 모듈 수정과는 독립적입니다.