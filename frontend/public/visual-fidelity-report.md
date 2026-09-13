# TASK-395 visual fidelity evidence

Visual source of truth: `main@9310d659cace8e041314208b8473d088e7e182ec`

Static source: `archive/static-demo-source`

## Reuse result

The archive renders the actual production React components, imports their
actual CSS, and uses the actual repository assets. It does not reconstruct the
screens as standalone portfolio HTML/CSS.

| Screen | Production UI reused | Static boundary | Classification |
|---|---|---|---|
| Home/Main | `OpeningPage`, `ConsumerMainPage` | deterministic user and route fixtures | REQUIRED STATIC DIFFERENCE |
| Prediction input/result | production search, candidate, comparison, and map-shell components | Promise-based search/prediction fixtures | REQUIRED STATIC DIFFERENCE |
| Station detail | `StationDetailPage` | stored `route-map.png` replaces Kakao canvas | REQUIRED STATIC DIFFERENCE |
| Riding Guide | `ConsumerRidingGuidePage` | factual and sample AI response fixture | REQUIRED STATIC DIFFERENCE |
| AI Planner/result | production planner and result pages | decision/evidence fixture; no model call | REQUIRED STATIC DIFFERENCE |
| Admin Dashboard | production `AdminV2PreviewApp` and operations dashboard | read-only success fixture; stored map asset | REQUIRED STATIC DIFFERENCE |
| All screens | production headers, cards, controls, icons, typography, spacing, and responsive CSS | compact top demo banner | INTENTIONAL DEMO BOUNDARY |

No unresolved visual difference was classified as a new design choice. Browser
QA found no horizontal overflow at 1440px or 390px.

## Side-by-side captures

Reference is on the left and the static archive is on the right:

- [Home 1440px](evidence/comparison/home-1440-reference-left-static-right.png)
- [Home 390px](evidence/comparison/home-390-reference-left-static-right.png)

The full screen sets are stored under:

- `evidence/reference/`
- `evidence/static/`

## Runtime gate

Expected runtime calls: Backend 0, inference 0, DB 0, OAuth 0, payment 0,
live inventory 0, weather API 0. Public deployment QA must reconfirm this gate
from browser requests and console output after each deployment.
