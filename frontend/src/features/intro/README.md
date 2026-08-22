# AUTH-FE-3.3 첫 방문 인트로

브라우저 첫 방문자에게 `출발 → 경로 이동 → 도착 → 예상 대수 확인` 흐름을 5초 동안 보여주는 독립 화면입니다.

## 공개 구성

- `IntroPage({ onComplete, storage })`: 5초 자동 완료 또는 `대여 가능성 예측 시작하기` 선택 후 `onComplete`를 한 번 호출합니다.
- `INTRO_SEEN_KEY`: `ddarung-flow:intro-seen`
- `hasSeenIntro(storage)`: 저장값이 문자열 `"true"`인지 확인합니다. 읽기 실패 시 `false`입니다.
- `markIntroSeen(storage)`: 완료 플래그를 저장합니다. 쓰기 실패는 화면 진입을 막지 않습니다.

## 오프닝 모션

- 별도 이미지, 영상, Lottie, npm 패키지 없이 기존 CSS와 인라인 SVG만 사용합니다.
- 0~0.35초에 문구와 배경이 나타나고, 0.35초부터 출발 지점을 강조합니다.
- 0.55~1.75초에 경로가 그려지며 0.75~2.2초에 작은 자전거가 도착지로 이동합니다.
- 1.85초부터 도착지와 주변 대여소의 예상 대수가 나타나고, 2.55초에 가장 여유 있는 곳을 추천합니다.
- 2.65~3.2초에 서비스 안내 카드가 순서대로 나타난 뒤 구름만 미세하게 반복 이동합니다.
- `prefers-reduced-motion: reduce`에서는 모든 장식 애니메이션을 정지하고 최종 내용을 즉시 표시합니다. 5초 자동 완료와 버튼 동작은 유지합니다.

화면에 표시되는 `7대`, `5대`, `3대`는 인트로에서 기능을 설명하기 위한 고정 예시입니다. 실시간 재고나 대여 보장을 뜻하지 않습니다.

## 조장 통합 지점

`App.jsx`에서 `hasSeenIntro(window.localStorage)`로 최초 방문 여부를 판단하고, 인트로가 필요할 때 `IntroPage`를 렌더링합니다. 실제 최초 방문 표시와 완료 후 메인 진입 연결은 조장의 `INT-3.3` 범위입니다.

## 제외 범위

- `App.jsx`, 로그인, 예측 결과 화면 수정
- 실제 API·라우팅 연결
- 서버 기반 사용자별 방문 기록

## 검증

```powershell
npm.cmd test -- --watchAll=false --runInBand src/features/intro/IntroPage.test.jsx src/App.test.jsx
npm.cmd test -- --watchAll=false --runInBand
npm.cmd run build
```
