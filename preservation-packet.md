# TASK-395 Preservation Packet

Recorded: 2026-09-13 KST

## Public evidence

| Item | Preserved reference |
|---|---|
| Interactive static demo | https://dataAnalyzeProject.github.io/ddarung-flow/ |
| Recorded live-service guide | https://youtu.be/7Tuu9zB14ME |
| Personal Portfolio | https://kimsunho.toxh13.chatgpt.site/ |
| Portfolio Project 01 | https://kimsunho.toxh13.chatgpt.site/portfolio/ddarung-flow/ |
| Public Notion case study | https://app.notion.com/p/3cd00ce3705c81d09070db8b3dfc04bf |
| GitHub repository | https://github.com/dataAnalyzeProject/ddarung-flow |

## GitHub delivery baseline

- Main SHA: `9310d659cace8e041314208b8473d088e7e182ec`
- PR #432: `MERGED`
- Post-merge CI #947: `SUCCESS`, same SHA
- Staging CD #373: `SUCCESS`, same SHA
- Runtime evidence for the docs-only PR: `NOT_RUN`
- Static demo source: independent orphan `gh-pages` branch; `main` unchanged
- Static demo implementation SHA: `b88ea577b76534490fc5791e77f1483ab27c60ab`
- GitHub Pages deployment #34763602276: `SUCCESS`

## Static demo acceptance evidence

- First-entry boundary: `Portfolio Demo · Sample Data · Backend Offline`
- Flow: search conditions → candidate comparison → station detail → riding guide
- Representative views: AI Planner, read-only Admin Dashboard, Evidence
- Public browser QA: 1440×1000 and 390×844
- Page-wide horizontal overflow: none across all eight views
- Console errors/warnings: 0
- Application backend/inference/database/OAuth requests: none
- Loaded resources: document, `styles.css`, and `app.js` only
- [Desktop 1440px screenshot](evidence/demo-desktop-1440.png)
- [Mobile 390px screenshot](evidence/demo-mobile-390.png)

## Portfolio and documentation update

- Personal Portfolio Sites version 10: `SUCCEEDED`
- Portfolio source SHA: `8ec591cc98f1fa176ba5d643191216cb7739bc27`
- Project 01 first CTA: `Interactive Demo`
- Recorded live-service video remains separately labeled `5분 Demo`
- Public Notion: static archive callout and Interactive Demo links added and
  read back after update

## Preservation boundary

This packet preserves public references and identifiers. It intentionally does
not copy secrets, credentials, personal data, private harness files, database
contents, or OCI configuration values into GitHub.
