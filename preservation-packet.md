# TASK-395 Preservation Packet

Recorded: 2026-09-14 KST

## Public evidence

| Item | Preserved reference |
|---|---|
| Interactive static demo | https://dataAnalyzeProject.github.io/ddarung-flow/ |
| Visual fidelity report | https://dataAnalyzeProject.github.io/ddarung-flow/visual-fidelity-report.md |
| Recorded live-service guide | https://youtu.be/7Tuu9zB14ME |
| Personal Portfolio | https://kimsunho.toxh13.chatgpt.site/ |
| Portfolio Project 01 | https://kimsunho.toxh13.chatgpt.site/portfolio/ddarung-flow/ |
| Public Notion case study | https://app.notion.com/p/3cd00ce3705c81d09070db8b3dfc04bf |
| GitHub repository | https://github.com/dataAnalyzeProject/ddarung-flow |

## GitHub delivery baseline

- Visual source of truth: `main@9310d659cace8e041314208b8473d088e7e182ec`
- Main application behavior: unchanged
- Static source branch: `archive/static-demo-source`
- Static source SHA: `d05c4977ec0098f7a6331ee29ff6f045871312d9`
- Static artifact deployment SHA: `DEPLOYMENT_COMMIT_PENDING`
- PR #432: `MERGED`
- Post-merge CI #947: `SUCCESS`, same main SHA
- Staging CD #373: `SUCCESS`, same main SHA
- Runtime evidence for the docs-only PR: `NOT_RUN`

## Actual UI reuse strategy

- Actual production React pages and shared components are imported from
  `consumer-r2` and `admin-v2`.
- Actual production CSS, design tokens, typography, cards, controls,
  navigation, spacing, and icons remain authoritative.
- Actual `route-map.png` is used wherever Kakao Maps would require runtime
  network access.
- Only the data/runtime boundary changes: deterministic fixtures replace API,
  model, auth, map, inventory, and weather providers.
- The compact `Portfolio Demo · Sample Data · Backend Offline` banner is the
  only added navigation/identity layer.

## Acceptance evidence

- Screens: Home/Main, Prediction input/result, Station Detail, Riding Guide,
  AI Planner/result, and Admin Dashboard
- Public QA viewports: 1440×1000 and 390×844
- Expected horizontal overflow: none
- Expected console errors/warnings: 0
- Expected backend/inference/database/OAuth/payment/live-inventory/weather calls: 0
- [Desktop side-by-side](evidence/comparison/home-1440-reference-left-static-right.png)
- [Mobile side-by-side](evidence/comparison/home-390-reference-left-static-right.png)

## Known static-only differences

- `REQUIRED STATIC DIFFERENCE`: Promise-based fixture adapters replace live
  backend, inventory, weather, and AI results.
- `REQUIRED STATIC DIFFERENCE`: stored repository map imagery replaces Kakao
  Maps canvas/runtime.
- `INTENTIONAL DEMO BOUNDARY`: compact top demo banner and screen shortcuts.
- `INTENTIONAL DEMO BOUNDARY`: demo authenticated user and read-only Admin
  access; OAuth and writes remain disabled.
- No new portfolio visual system is used.

## Preservation boundary

This packet intentionally excludes secrets, credentials, personal data,
private harness files, database contents, and OCI configuration values. OCI
runtime shutdown remains outside TASK-395 and has not been executed.
