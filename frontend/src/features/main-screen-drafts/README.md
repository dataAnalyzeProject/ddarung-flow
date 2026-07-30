# 메인 화면 스타일 시안

실제 지도, 따릉이 API, 로그인, 예측 계산을 연결하지 않은 PC 화면용 디자인 시안입니다.
세 시안은 모두 `data/mockData.js`의 같은 문구와 숫자를 사용합니다.

## 컴포넌트

| 시안 | 파일 | 연결할 컴포넌트 | 특징 |
| --- | --- | --- | --- |
| 시안 1 | `drafts/Draft1MapFirst.jsx` | `Draft1MapFirst` | 지도를 화면 전체에 크게 배치하고 검색창과 추천 결과를 지도 위에 표시 |
| 시안 2 | `drafts/Draft2MapAndList.jsx` | `Draft2MapAndList` | 검색, 지도, 대여소 목록을 좌우 3영역으로 분리 |
| 시안 3 | `drafts/Draft3SearchFirst.jsx` | `Draft3SearchFirst` | 검색 영역을 가장 먼저 강조하고 아래에 카드 결과와 지도를 표시 |

## 조장에게 요청할 연결 예시

`App.jsx`에서 확인하려는 컴포넌트 하나만 임시로 import해 렌더링해 주세요.

```jsx
import Draft1MapFirst from "./features/main-screen-drafts/drafts/Draft1MapFirst";

function App() {
  return <Draft1MapFirst />;
}
```

시안 2는 `Draft2MapAndList`, 시안 3은 `Draft3SearchFirst`로 이름만 바꿔 연결합니다.

## 범위

- 공통 예시 데이터만 사용
- 실제 지도 및 외부 API 연결 없음
- 로그인, 보안, DB, 백엔드 연결 없음
- 모바일 대응 및 시안 비교 화면 없음
- 새 라이브러리 사용 없음

