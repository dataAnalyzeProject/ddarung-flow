# Journey Safe-off Release Candidate Evidence

## Identity

- START_BASE_SHA: `396745f42ac72b133dd02636b485e9e41de70b7d`
- exact HEAD: the committed evidence cannot self-reference its own final SHA; the pushed PR head is recorded in the PR and Notion submission after the commit
- verification date: 2026-08-28 (Asia/Seoul)
- environment: Windows PowerShell, local Java/Gradle, Node/npm, Python, Docker CLI
- sensitive data: no API key, model artifact, OAuth secret, or user data was used or recorded

## Start gate

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| `origin/main` | `396745f...` | `396745f42ac72b133dd02636b485e9e41de70b7d` | PASS |
| #230 | merged | merged at the base SHA | PASS |
| main CI | success at base SHA | CI run `33175277717` success | PASS |
| Staging CD | success at base SHA | Staging CD run `33175428869` success | PASS |
| open PR review | changed files reviewed | no overlapping Journey implementation path identified | PASS |

## Safe-off implementation checks

| Verification ID | Command or scope | Expected / actual | Result |
| --- | --- | --- | --- |
| JNY-RC-FLAG-01 | `JourneyReleaseGateFilterTest` | `JOURNEY_ENABLED=false` returns 404 for `/api/v1/journeys/**` and `/api/v1/saved-journeys/**`; no Journey decision or saved-journey rows; AI gateway and `ReturnPredictionPort` have no interactions; `/api/v1/auth/me` remains available | PASS |
| JNY-RC-FLAG-02 | `JourneyControllerTest`, `SavedJourneyControllerTest` | test profile sets `journey.enabled=true`; existing plan/replan/isolation/idempotency behavior remains available | PASS |
| JNY-RC-FE-01 | `src/App.test.jsx` | unset, `false`, `TRUE`, and `1` Journey planner hashes fall back to main; OFF Journey result and programmatic navigation do not create Journey routes; exact string `true` renders Planner; existing non-Journey hash routes remain covered | PASS |
| JNY-RC-COMPOSE-01 | `docker compose ... config --quiet` | default and `journey` profile configs parse with `JOURNEY_ENABLED` defaulting false | PASS |

The release filter runs at highest precedence and ends disabled Journey paths before authentication, controllers, database writes, AI gateway calls, or return-prediction calls. It does not add a public error code and does not modify `SecurityConfig`.

## Regression commands

| Area | Command | Actual | Result |
| --- | --- | --- | --- |
| Backend | `cd backend; .\\gradlew.bat test --no-daemon --rerun-tasks` | 79 suites, 383 tests, 0 failures/errors | PASS |
| Frontend | `cd frontend; npm.cmd test -- --watchAll=false --runInBand` | 37 suites, 321 tests | PASS |
| Frontend build | `cd frontend; npm.cmd run build` | compiled successfully | PASS |
| Pipeline | `D:\\GitHub\\ddarung-flow\\.venv\\Scripts\\python.exe -m pytest pipeline\\tests -q` | 184 passed, 1 skipped | PASS |
| Existing inference | `python -m unittest discover -s infra\\inference -p test_app.py -v` | 13 tests | PASS |
| Return inference | `python -m unittest discover -s infra\\return-inference -p test_app.py -v` | 9 tests | PASS |
| Compose default | `docker compose --env-file infra\\staging\\.env.example -f infra\\staging\\docker-compose.yaml config --quiet` | parsed; only unset-secret warnings | PASS |
| Compose Journey profile | same command with `--profile journey` | parsed; only unset-secret warnings | PASS |
| Docker build | `docker build -t ddarung-flow-return-inference:e0-rc infra\\return-inference` | image built successfully with Docker Desktop Linux daemon | PASS |
| Docker smoke: health | `GET http://127.0.0.1:18082/health` | HTTP 200; `serviceStatus=RUNNING`, `modelStatus=UNAVAILABLE`, `ready=false` | PASS |
| Docker smoke: predict | valid `POST http://127.0.0.1:18082/predict` | HTTP 503; `status=UNAVAILABLE`, `errorCode=MODEL_NOT_CONFIGURED`; no `probabilities` or `selectedProbability` | PASS |
| OCI Journey activation | staging deployment workflow | workflow does not pass the frontend build arg or backend runtime env; OCI staging remains default-false safe-off; activation wiring requires a separate PR | NOT_RUN |
| Browser / independent backend HTTP / DB | same-SHA local runtime | not run in this environment; return-inference Docker smoke above is isolated and does not cover the Journey backend/browser/DB path | NOT_RUN |
| Real OpenAI, return artifact, routing provider | live provider evidence | deliberately disabled and not contacted | NOT_RUN |

## Decision

- Automated regressions and isolated Docker safe-off smoke: PASS.
- Verdict: `COMPONENT_PASS`.
- `INTEGRATION_PASS` and `RELEASE_PASS`: not claimed.
- `COMPONENT_PASS` covers the safe-off boundary only; OCI activation wiring is `NOT_RUN`.
- Browser, independent Journey backend HTTP/DB, real OpenAI, return artifact, and routing provider evidence remain `NOT_RUN`; this is not a completed release acceptance record.
