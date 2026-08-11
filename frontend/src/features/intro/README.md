# AUTH-FE-3.3 첫 방문 인트로

브라우저 첫 방문자에게 서비스 설명을 5초 동안 보여주는 독립 화면입니다.

## 공개 구성

- `IntroPage({ onComplete, storage })`: 5초 자동 완료 또는 `바로 시작하기` 선택 후 `onComplete`를 한 번 호출합니다.
- `INTRO_SEEN_KEY`: `ddarung-flow:intro-seen`
- `hasSeenIntro(storage)`: 저장값이 문자열 `"true"`인지 확인합니다. 읽기 실패 시 `false`입니다.
- `markIntroSeen(storage)`: 완료 플래그를 저장합니다. 쓰기 실패는 화면 진입을 막지 않습니다.

## 조장 통합 지점

`App.jsx`에서 `hasSeenIntro(window.localStorage)`로 최초 방문 여부를 판단하고, 인트로가 필요할 때 `IntroPage`를 렌더링합니다. 실제 최초 방문 표시와 완료 후 메인 진입 연결은 조장의 `INT-3.3` 범위입니다.

## 제외 범위

- `App.jsx`, 로그인, 예측 결과 화면 수정
- 실제 API·라우팅 연결
- 서버 기반 사용자별 방문 기록
