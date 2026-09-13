# Portfolio diagram specification

## Purpose

Four README diagrams make the portfolio’s verified product flow, architecture, collaboration boundary, and release evidence readable without changing application behavior. They use white ground, navy type, blue navigation, and teal verified-state accents. SVG is text-first: no remote font, JavaScript, raster image, or `foreignObject`.

## Shared system

- Canvas: `1600 × 900` or card-format equivalent; white field, navy `#102A43`, blue `#2563EB`, teal `#0F9D8A`, pale blue `#EAF2FF`, pale teal `#E6F7F3`, muted slate `#5C6B7A`.
- Typography: system sans-serif; title 34–42px, section 16–18px, body 15–17px. Use text labels as the accessible source, and arrows with visible direction. Every SVG declares and uses `.text-main`, `.text-muted`, `.text-white`, `.text-teal`, and `.text-blue`; dark surfaces receive only explicit white or teal text classes.
- Layout: an editorial 16:9 board, generous gutters, 16px corner language, thin structural rules. Accent color encodes category only; labels carry every state.
- Accessibility: every file has a title and description, non-color labels, and a readable logical order. Decorative rules and arrows use `aria-hidden`.

## 01 — Consumer flow

**Message:** a route decision is made for arrival time, not from current inventory alone. Three broad stages: INPUT, PREDICTION, DECISION. Show origin/destination, arrival time, travel mode and required quantity; route and ETA; station comparison. Mark login only as the boundary before protected prediction. `TOO_SOON` shows latest current stock only, never an invented probability.

## 02 — Service architecture

**Message:** sources, quality/model work, service boundary, and user surfaces are distinct responsibilities. Sources are Seoul public-bike, Kakao Maps/Local/Routing, KMA, and AirKorea. Data/ML contains Airflow/Python and raw/quarantine/curated, PostgreSQL/OCI Object Storage, and an approved model. Service contains Spring/Security/JPA/private inference with H1–H4 and quantity 1–5. Consumer Web, Admin/Ops, and AI Planner are service consumers; DeepSeek is a planning assistant, not a probability generator. Weather/AirKorea are contextual inputs, not claimed direct Core ML features. GitHub Actions → Docker → OCIR → OCI staging is a small delivery note.

## 03 — Team collaboration

**Message:** five peer role boundaries meet through contracts and evidence. Use five equal cards: 김선호 (PM / Integration / DevOps), 황준형 (Data / ML), 선경원 (Backend / API / DB), 유제훈 (Frontend / 관리자 시각화), 김로운 (Frontend / Consumer / Admin UI). A horizontal Kim Sunho lane connects WBS, PR integration, CI/CD, and release evidence without placing him above implementation cards.

## 04 — Integration and release engineering

**Message:** Kim Sunho connects verified data, cloud, integration, and operations boundaries; this is not a claim of ownership over model training or evaluation. Four pillars show (1) Realtime APIs → Airflow → Raw → Quality → Curated with duplicate-prevention and failure-boundary notes, (2) OCI Object Storage for Raw/Curated/artifact with manifest, lineage, checksum, immutable upload, (3) Notion Contract → Branch → PR → Changed Path → five CI quality gates → main, and (4) Docker → OCIR → OCI Staging → smoke/rollback/runtime evidence. The release handoff visibly connects main → exact SHA verification → stale candidate guard → changed image detection → Docker build/push. The five CI branches are Frontend (npm test, npm run build), Backend (Gradle test), Pipeline (pytest), Inference (unit test, compose config, docker build), and Workflow Validation (release flag, actionlint, secret/key guard). Runtime evidence lists deployed commit match, backend/inference/postgres running, restart checks, and HTTP 5xx/unhandled/DB/inference failure marker checks; it does not claim frontend health or browser acceptance.

## Source boundary

The diagrams summarize the current README and these implementation sources: `.github/workflows/ci.yml`, `.github/workflows/staging-deploy.yml`, `.github/workflows/staging-runtime-evidence.yml`, and `infra/staging/docker-compose.yaml`. The README’s frozen portfolio baseline SHA remains historical text; this document does not relabel it as the current main SHA.
