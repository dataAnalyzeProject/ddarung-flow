# Journey staging safe-off

`infra/staging/journey-release-flags.env` is the versioned, top-level staging release flag. It must contain exactly `JOURNEY_ENABLED=true` or `JOURNEY_ENABLED=false`; the current default is `false`.

This release flag does not enable any lower-level capability by itself. `JOURNEY_AI_ENABLED`, `RETURN_PREDICTION_ENABLED`, and `JOURNEY_PHASE_A_FIXTURE_ENABLED` remain separate lower-level flags and default to `false`. The `journey` Compose profile keeps `return-inference` on the private `staging` network with no host port. With no configured model artifact, its health/predict contract remains not-ready and does not return a production prediction.

When the top-level value is `false`, the frontend does not render Journey routes and Journey API paths return 404 before authentication, controllers, database, AI, or return-prediction work. `return-inference` can be included only with the `journey` Compose profile; with no production model it reports `/health` as `RUNNING` and `UNAVAILABLE` with `ready: false`, while `/predict` returns `503 MODEL_NOT_CONFIGURED` with no probability fields.

Changing `false` to `true` requires a separate approved PR. The frontend receives the flag as the build-time `REACT_APP_JOURNEY_ENABLED` argument and must be rebuilt under the new commit SHA. The backend receives the same value as its runtime `JOURNEY_ENABLED` environment value. A release candidate records its deployed commit, flag, and frontend/backend image tags together; an image tag is never overwritten with a different build argument.

Rollback restores the prior release files and images, including the prior flag commit. This wiring PR is not an activation: actual OpenAI, return-model, and routing providers remain `NOT_RUN`.
