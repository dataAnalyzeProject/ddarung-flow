# Final Image Placement Manifest R3

R3는 `final-image-placement-r2.md`의 사용·제외 판정을 유지한다. 변경은 4.5 대여소 상세의 #277 반영 실제 배포 캡처와 설명뿐이다.

## Final placement

| Section | Image | Priority | Size | Caption | Status |
|---|---|---:|---|---|---|
| 3. Solution | `consumer/notion/consumer-flow.png` | HERO | WIDE | 장소 선택부터 상세 확인까지의 의사결정 흐름 | USED |
| 4.1 Conditions and arrival | `consumer/02-search-condition.png` | PRIMARY | WIDE | 출발지·목적지·이동 수단·필요 수량으로 도착시각을 계산 | USED |
| 4.2 Prediction result | `consumer/notion/04-prediction-result.png` | PRIMARY | FULL | 후보별 도착시점 필요 수량 이상 확보 확률 | USED |
| 4.3 Candidate comparison | `consumer/notion/05-candidate-comparison.png` | SUPPORT | WIDE | 확률·현재 재고·거리·도착시간을 함께 비교 | USED |
| 4.4 Candidate guide | `consumer/notion/06-candidate-guide.png` | SUPPORT | WIDE | 대여 가능성·수량별 가능성·날씨·대기질·주의사항을 분리해 안내 | USED |
| 4.5 Station detail | `consumer/notion/06-station-detail.png` | SUPPORT | WIDE | 현재 재고와 최근 90일 관측 패턴·회복 특성·대여소 위치 확인 | USED |
| 5. Input UX extension | `journey/notion/02-natural-language.png` | PRIMARY | WIDE | 자연어 입력으로도 같은 Consumer 조건을 구성 | USED |
| 5. Input UX extension | `consumer/notion/journey-input-extension.png` | SUPPORT | WIDE | Journey 입력이 Consumer Core로 연결되는 범위 | USED |
| 5. Input UX extension | `journey/notion/03-journey-result.png` | OPTIONAL | TOGGLE | 결과 확인은 보조 입력 흐름의 예시로만 제공 | USED |
| 6. Data and ML | `data-ml/notion/data-quality-overview.png` | PRIMARY | FULL | 학습 데이터 규모와 품질 상태를 함께 점검 | USED |
| 6. Data and ML | `data-ml/notion/prediction-problem.png` | SUPPORT | HALF | 현재 재고와 도착시점 판단을 분리한 예측 문제 | USED |
| 6. Data and ML | `data-ml/notion/six-bucket-model.png` | SUPPORT | HALF | 재고 분포를 6개 구간으로 다루고 필요 수량 확률로 해석 | USED |
| 6. Data and ML | `data-ml/notion/model-evaluation.png` | SUPPORT | HALF | 기준선과 현행 평가를 분리해 읽는 방법 | USED |
| 6. Data and ML | `data-ml/notion/reliability-limitations.png` | SUPPORT | HALF | 확률을 보장으로 해석하지 않기 위한 한계와 상태 | USED |
| 6. Data and ML | `data-ml/notion/data-ml-to-product.png` | SUPPORT | WIDE | Consumer 추론과 Operations 위험 스냅샷의 책임 분리 | USED |
| 7. Operations console | `admin/operations/notion/consumer-admin-relation.png` | PRIMARY | WIDE | 사용자 의사결정과 운영 확인의 역할 분리 | USED |
| 7. Operations console | `admin/operations/notion/01-ops-dashboard.png` | PRIMARY | WIDE | 현재 데이터 상태를 숨기지 않는 운영 대시보드 | USED |
| 7. Operations console | `admin/operations/notion/02-risk-map.png` | SUPPORT | WIDE | 지도에서 우선 확인할 위험 대여소를 탐색 | USED |
| 7. Operations console | `admin/operations/notion/04-stockout-pattern.png` | SUPPORT | WIDE | 과거 품절·회복 패턴을 운영 판단의 참고로 확인 | USED |
| 7. Operations console | `admin/operations/notion/admin-operations-flow.png` | SUPPORT | WIDE | 위험 탐색부터 확인까지의 운영 흐름 | USED |
| 8. Architecture | `architecture/notion/service-architecture.png` | PRIMARY | FULL | 웹·API·지도·데이터·추론 경계가 분리된 서비스 구조 | USED |
| 9. Batch vs online | `architecture/notion/data-serving-flow.png` | PRIMARY | WIDE | 배치 데이터 준비와 요청 시점 Consumer 추론의 역할 분리 | USED |
| 10. Auth/Authz/Delivery | `architecture/notion/security-delivery.png` | PRIMARY | WIDE | 소셜 로그인·서버 권한·검증 중심 전달 경로 | USED |

## Excluded from public placement

| Group | Image | Status |
|---|---|---|
| Duplicate | `consumer/03-login-boundary.png` | EXCLUDED — DUPLICATE |
| Duplicate | `journey/notion/01-journey-form.png` | EXCLUDED — DUPLICATE |
| Duplicate | `journey/notion/journey-flow.png` | EXCLUDED — DUPLICATE |
| Duplicate | `journey/notion/journey-core-relation.png` | EXCLUDED — DUPLICATE |
| Capture provenance | `journey/raw/01-journey-form-raw.png`, `journey/raw/02-natural-language-raw.png`, `journey/raw/03-journey-result-raw.png` | EXCLUDED — RAW |
| Capture provenance | `consumer/raw/04-prediction-result-raw.png`, `consumer/raw/05-candidate-comparison-raw.png`, `consumer/raw/06-candidate-guide-raw.png`, `consumer/raw/06-station-detail-raw.png` | EXCLUDED — RAW |
| Capture provenance | `admin/operations/raw/01-ops-dashboard-raw.png`, `admin/operations/raw/02-risk-map-raw.png`, `admin/operations/raw/04-stockout-pattern-raw.png` | EXCLUDED — RAW |

## Count

- Final public image count: **23**
- Excluded duplicate images: **4**
- Excluded raw provenance images: **10**
- Data/ML display order: **Data Quality → Prediction Problem → Model Structure → Evaluation → Limitations → Product**
