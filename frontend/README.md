# 화면 작업 시작하기

이 폴더는 Create React App 방식의 React + JavaScript/JSX 기본 골격입니다.

프로젝트 진행 중 Vite나 TypeScript로 변경하지 않습니다. 작업자는 현재 `react-scripts` 기반의 `.js`·`.jsx` 구조와 아래 명령을 그대로 사용합니다.

## 처음 한 번

```powershell
npm install
```

## 화면 실행

```powershell
npm start
```

터미널에 표시되는 주소를 브라우저에서 열면 됩니다.

## 테스트와 빌드

```powershell
npm test -- --watchAll=false
npm run build
```

## 작업 폴더

- `src/features/login/`: 로그인 화면 담당자
- `src/features/main-screen-drafts/`: 메인 화면 예시안 담당자
- `src/pages/`: 두 작업을 한 화면에 모으는 곳, 조장 또는 통합 담당자만 수정
- `src/shared/`: 여러 화면이 함께 쓰는 코드, 조장 또는 통합 담당자만 수정

처음 실행하면 Create React App의 React 기본 시작 화면이 보입니다. 담당자는 자신의 작업 폴더에 새 파일을 만들고, `App.jsx` 연결은 조장 또는 통합 담당자에게 요청합니다.
