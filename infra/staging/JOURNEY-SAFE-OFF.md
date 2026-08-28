# Journey safe-off staging wiring

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

Connecting a real model artifact and a real OpenAI API key are follow-up work. Do not commit either artifact or any secret value.

The current OCI staging deployment workflow does not pass `REACT_APP_JOURNEY_ENABLED` as a frontend build argument or `JOURNEY_ENABLED` as a backend runtime environment value. OCI staging therefore remains default-false safe-off. Activation wiring is `NOT_RUN`: a separate activation PR must rebuild the frontend and set the backend runtime environment together.

Rollback is soft: set the Journey-related feature flags to `false` and run the stack without the `journey` profile. `COMPONENT_PASS` covers this safe-off boundary only; it does not claim `INTEGRATION_PASS` or `RELEASE_PASS`.
