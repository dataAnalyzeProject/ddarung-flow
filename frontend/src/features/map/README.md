# StationMap

Fixture 전용 대여소 지도 UI입니다. `stations`, `viewport`, `onViewportChanged`, `onStationSelected` props를 받고 실제 Kakao SDK나 따릉이 API에는 연결하지 않습니다.

`assets/`의 지도 배경, 현재 위치, 대여소 핀은 화면 목업 전용 이미지입니다. 실제 지도 타일·마커는 INT-4.1에서 제공자 SDK와 연결합니다.
