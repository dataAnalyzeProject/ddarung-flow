# Journey OCI activation wiring

Base SHA: `e58c0c3add8fd523fe9416a996296b3a3b560a77`.

## Design

`infra/staging/journey-release-flags.env` is a checked-in release input with the safe default `JOURNEY_ENABLED=false`. The staging deployment workflow rejects every value except the exact lower-case strings `true` and `false`.

The workflow passes the accepted value to the frontend as `REACT_APP_JOURNEY_ENABLED` at image build time and writes the same value to the backend runtime release environment as `JOURNEY_ENABLED`. A release candidate also records `DEPLOYED_COMMIT`, `FRONTEND_IMAGE_TAG`, and `BACKEND_IMAGE_TAG` without exposing secrets.

Images are immutable: a Journey flag-file change makes the frontend build target the new candidate SHA even if the frontend source did not change. The backend image can reuse its previous SHA tag when backend code did not change, while the backend container receives the new runtime flag. No existing image tag is rebuilt with a different build argument.

## Validation

```powershell
docker run --rm `
  -v "${PWD}:/repo" `
  -w /repo `
  rhysd/actionlint:1.7.8 `
  .github/workflows/ci.yml `
  .github/workflows/staging-deploy.yml

docker compose `
  --env-file infra/staging/.env.example `
  -f infra/staging/docker-compose.yaml `
  config --quiet
```

CI validates the checked-in `false` value and proves that `true` is accepted while empty, upper-case, numeric, affirmative-word, and whitespace-padded values are rejected. A flag-file change selects frontend and backend checks plus workflow validation; the deployment workflow rebuilds the frontend under the candidate SHA and verifies frontend/backend flag equality in the rendered candidate.

## Result status

- PASS: tracked default flag is `false`; the workflow has explicit frontend build-time and backend runtime propagation.
- NOT_RUN: OCI staging activation, a `true` release PR, actual OpenAI/return/routing provider calls, and rollback execution.
