# FE 3-1 예측 결과 화면

## 파일 역할

- `PredictionResults.jsx`: 정상 결과, 결과 없음, 상세와 대체 후보 상태 및 승인된 화면 콜백을 조합합니다.
- `PredictionResults.css`: 승인된 시안 6의 카드 중심 PC 배치를 적용합니다.
- `PredictionResults.test.jsx`: 정상, 결과 없음, 상세 펼치기, 낮음 대체 후보를 검사합니다.
- `components/PredictionCard.jsx`: 후보별 거리, 이동시간, 도착시각, 재고와 확률 카드입니다.
- `components/PredictionDetails.jsx`: 1~5대 누적확률, 기준시각, 모델과 상태 상세입니다.
- `data/predictionResultMock.js`: API v1.1의 승인 예시 응답을 보관합니다.

## 구현 상태

- 실제 API, 지도, 로그인은 연결하지 않았습니다.
- `candidates` 배열 순서대로 후보를 표시합니다.
- 승인 Mock의 `requiredBikeCount`, `selectedProbability`, `availabilityLevel`을 변경 없이 표시합니다.
- 결과 없음의 입력 수정 버튼은 `onEditInput`을, 대여소 선택은 `onSelectStation(stationId)`를 호출합니다.
- 낮음 후보 선택 시 나머지 후보를 대체 대여소로 최대 5곳 표시합니다.
- 결과 없음 상태에서 안내와 입력 수정 버튼을 표시합니다.

## 확인 명령

```powershell
npm test -- --watchAll=false PredictionResults.test.jsx
npm run build
```

## 조장 후속 작업

- 승인 후 공통 라우팅 또는 `App.jsx`에서 `PredictionResults`를 연결합니다.
- 실제 API 연동 단계에서 Mock을 서버 응답으로 교체합니다.
