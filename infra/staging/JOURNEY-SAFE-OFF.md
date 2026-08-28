# Journey safe-off staging wiring

`infra/staging/journey-release-flags.env` is the versioned, top-level staging release flag. It must contain exactly `JOURNEY_ENABLED=true` or `JOURNEY_ENABLED=false`; the current default is `false`.

`JOURNEY_ENABLED` is the top-level Journey release gate. It defaults to `false` for both the backend runtime and frontend build; the frontend only enables Journey routes when `REACT_APP_JOURNEY_ENABLED` is exactly `true`.

- `false`, empty, or unset: Journey routes are not rendered, Journey navigation does not create a Journey hash, and Journey API paths return 404 before authentication, controllers, database, AI gateway, or return-prediction processing.
- `true`: the existing Journey routes and backend behavior are available.

Journey AI, return prediction, and the Phase A fixture are all disabled by default. The backend starts without the `return-inference` service, because it has no unconditional dependency on it.

To include the private return-inference service locally, use the Journey profile:

```powershell
docker compose -f infra/staging/docker-compose.yaml --profile journey up -d
```

The service has no host port and is connected only to the private `staging` network. Its existing Dockerfile healthcheck calls `/health`. With no configured production model artifact, the expected health response is HTTP 200 with `serviceStatus: RUNNING`, `modelStatus: UNAVAILABLE`, and `ready: false`.

`/predict` must return HTTP 503 `MODEL_NOT_CONFIGURED` in that state. It must not include `probabilities` or `selectedProbability`, and it must not synthesize a normal probability response.

Changing `false` to `true` requires a separate approved PR. The staging workflow passes the accepted release value to the frontend as build-time `REACT_APP_JOURNEY_ENABLED` and to the backend as runtime `JOURNEY_ENABLED`; the frontend must be rebuilt under the new commit SHA. A release candidate records its deployed commit, flag, and frontend/backend image tags together, and no image tag is overwritten with a different build argument.

Connecting a real model artifact and a real OpenAI API key are follow-up work. Do not commit either artifact or any secret value. This wiring PR is not an activation: actual OpenAI, return-model, and routing providers remain `NOT_RUN`.

Rollback restores the prior release files and images, including the prior flag commit. `COMPONENT_PASS` covers this safe-off boundary only; it does not claim `INTEGRATION_PASS` or `RELEASE_PASS`.
