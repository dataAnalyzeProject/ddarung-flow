# Public Claim Audit R2 — Station Detail

이 감사는 #277 반영 대여소 상세 캡처와 R3 공개 문구에 한정한다. `verified`는 현재 원격 `main` 구현과 실제 Staging 화면을 모두 확인한 표현이며, `limited`는 한계를 문장에 함께 유지해야 하는 표현이다.

| Claim | Evidence | Public wording | Status | Caveat |
|---|---|---|---|---|
| 현재 재고·수집 시각·데이터 상태 | `origin/main@94a41f21` `StationDetailPage.jsx`, 실제 `#station/ST-3325` | 선택한 대여소의 현재 상태를 확인한다. | verified | 현재 재고는 도착시점 예측값이 아니다. MISSING·UNAVAILABLE을 0으로 바꾸지 않는다. |
| 최근 90일 패턴 | 같은 구현의 `RhythmHeatmap`, 실제 화면의 최근 90일 관측·요일/시간대 히트맵 | 최근 90일 관측 패턴을 확인한다. | verified | 화면의 명시 문구대로 미래 예측값으로 표현하지 않는다. |
| 품절 지속·회복 특성 | 같은 구현의 `stockout` 통계, 실제 화면 | 품절 지속·회복 특성을 확인한다. | verified | 과거 관측에 근거한 특성이며 대여 보장이나 도착시점 확률이 아니다. |
| 주변 대여소 | `fetchNearbyStations`와 실제 주변 대여소 3곳 | 주변 대여소를 함께 확인한다. | verified | 후보를 자동으로 결정하거나 순위를 보장한다고 주장하지 않는다. |
| 실제 위치 미니맵 | `StationLocationMiniMap.jsx`, 실제 Kakao 지도 카드 | 실제 위치를 지도에서 확인한다. | verified | 미니맵은 읽기 전용 위치 정보이며 모델 증빙·경로 계산·예측 결과가 아니다. |
| 과거 관측과 미래 예측의 분리 | `station-historical-notice`, 실제 안내 문구 | 과거 관측 패턴은 도착시점 미래 예측과 구분해 제공한다. | verified | 두 정보를 같은 수치나 같은 보장으로 해석하지 않는다. |

## Publication gate

- Latest remote `main`: `94a41f21a649deff000a4d55e6c4f5f4179af2d9`
- Main CI: success, run `33361912499`, same SHA
- Staging CD: success, run `33362031736`, same SHA
- Actual authenticated route: `https://shdomain.kro.kr/#station/ST-3325`
- `NOTION_MUTATION_HOLD`: **YES** — 이 작업은 로컬 public package freeze만 수행하며 실제 Notion을 수정하지 않았다.
