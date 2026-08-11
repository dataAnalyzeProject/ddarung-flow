# FE-3.3 place-search Starter

이 폴더는 장소·대여소 검색과 이동 조건 선택 화면을 실제 서버 호출 없이 구현하기 위한 전용 작업 영역입니다.

## 파일

- `PlaceStationSearchPage.jsx`: 경로 검색·직접 시간 입력 화면과 선택값 전달
- `PlaceStationSearchPage.css`: PC 화면 스타일
- `PlaceStationSearchPage.test.jsx`: 조장이 준비한 비활성 테스트 5개와 담당자 추가 테스트
- `data/placeStationSearchMock.js`: 승인 API 계약의 필드를 사용한 장소·대여소 예시 데이터

## 시작 방법

`PlaceStationSearchPage.test.jsx`의 `test.skip`을 한 개씩 `test`로 바꾸고 해당 테스트를 만족하는 최소 기능을 구현합니다.

## 경계

이 폴더에서는 실제 API, Kakao 지도, 로그인, 예측 결과, 공통 `App.jsx`를 연결하지 않습니다. 실제 연결과 전체 사용자 흐름 검증은 조장이 `INT-4.1`에서 수행합니다.

## 담당자 구현 결과
- 구현한 상태:
  - `경로로 찾기` (`ROUTE`) 및 `직접 시간 입력` (`DIRECT`) 탭 전환 상태
  - 출발지·목적지·대여소 검색어 입력 및 공백 제거 2글자 이상 유효성 검사 상태 (`setValidationMessage`)
  - 출발지/목적지/대여소 선택 상태 및 이동수단(`WALK`/`PUBLIC_TRANSIT`), 도착 예정 분(숫자), 필요 자전거 수(1~5대) 관리
  - 검색 결과 상태(`idle`, `empty`, `error`) 분기 및 오류 시 `onSearch` 재호출 "다시 시도" 버튼 동작
  - 필수 조건 충족 여부에 따른 `계속하기` 버튼 활성화/비활성화 및 승인된 데이터 규격(payload) `onContinue` 전달
- 활성화한 테스트:
  1. FE-3.3 경로 방식 선택값을 승인된 형태로 전달한다 (`PASS`)
  2. FE-3.3 직접 시간 방식 선택값을 승인된 형태로 전달한다 (`PASS`)
  3. FE-3.3 두 글자 미만 검색어는 검색하지 않는다 (`PASS`)
  4. FE-3.3 결과 없음과 오류 상태를 구분한다 (`PASS`)
  5. FE-3.3 필수 선택 전에는 계속하기를 누를 수 없다 (`PASS`)
- 추가한 키보드 테스트:
  - `FE-3.3 키보드만 사용해 탭, 검색 결과, 조건 선택과 계속하기를 진행한다` (`PASS`)
    - 마우스 없이 `userEvent.tab()`, `userEvent.type()`, 키보드 엔터/스페이스 선택만으로 전체 흐름 포커스 이동 및 완료 검증
- 전체 테스트·빌드 결과:
  - Frontend 전체 유닛 테스트 PASS (7개 테스트 수트, 모든 테스트 통과)
  - Production Build 성공 (`npm run build` 검증 완료)
- 계약과 다른 점:
  - 직접 시간 입력 모드 시 `mode: 'DIRECT'`와 `travelMode: 'DIRECT'`가 동시에 전달되도록 백엔드 통신 규약을 정확히 준수했습니다.
- 조장에게 요청할 통합 작업:
  - 실제 백엔드 API (`/api/v1/places/search`, `/api/v1/stations/search`, `/api/v1/routes/candidates`) 및 Kakao 지도 SDK 연동 (`INT-4.1`)
  - `App.jsx` 공통 라우팅 연결 및 예측 결과 화면(`PredictionResults`) 데이터 파이프라인 연결

📌 참고 (API 계약 명세): mode는 화면의 탭 입력 방식(ROUTE | DIRECT)이며, 직접 시간 입력 모드일 경우 travelMode 필드는 서버 백엔드 통신 규약에 따라 "DIRECT" 상수값으로 설정됩니다. 그래서 직접 시간 입력 모드 시 mode: 'DIRECT'와 travelMode: 'DIRECT'가 동시에 사용되어 용어 혼선이 생길 수 있습니다. 후속 API refactoring 시 travelMode를 null로 처리하거나 이름을 구별하는 것을 제안합니다."

📌 테스트 환경 참고: 프로젝트 환경의 @testing-library/user-event 라이브러리 버전(v13 이하) 특성에 맞추어 userEvent.setup() 대신 동기식 userEvent.tab() 및 userEvent.keyboard() 방식으로 키보드 조작 테스트를 구현했습니다.