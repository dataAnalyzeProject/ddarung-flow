# FE-3.4 도착예정시간 날씨 카드 UI

승인된 PM-3.2 weather Mock 계약으로 날씨 카드와 상태 화면을 확인하는 독립 컴포넌트입니다. 실제 기상청 API, 백엔드, App 라우팅은 연결하지 않았습니다.

## 사용법

```jsx
<WeatherCard weather={weatherForecastMock.normal} expanded={expanded} onToggle={toggle} />
```

- `weather`: API 최상위 `weather` 객체와 같은 구조의 승인 Mock
- `expanded`: 시간대별 예보 펼침 여부
- `onToggle`: 펼치기·접기 버튼 callback

## 상태

- `NORMAL`: 기본 카드와 시간대별 예보
- `DELAYED`: 직전 발표 값, 지연 라벨, 실제 발표시각
- `MISSING`: `도착 예정시간의 날씨 예보가 없습니다.`
- `UNAVAILABLE`: `날씨 예보를 불러오지 못했습니다.`

우천 안내는 `rainGuidance=true`일 때만 표시합니다. 누락·불가 상태에서는 임의로 날씨나 우천 여부를 추정하지 않습니다.

## 확인

```powershell
npm test -- --watchAll=false
npm run build
```

정상·우천·실패 상태를 승인 Mock으로 실행해 캡처합니다. 실제 날씨 API adapter와 공통 화면 연결은 조장 후속 통합 범위입니다.
