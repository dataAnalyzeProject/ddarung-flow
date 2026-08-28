# Journey safe-off staging wiring

Journey AI, return prediction, and the Phase A fixture are all disabled by default. The backend starts without the `return-inference` service, because it has no unconditional dependency on it.

To include the private return-inference service locally, use the Journey profile:

```powershell
docker compose -f infra/staging/docker-compose.yaml --profile journey up -d
```

The service has no host port and is connected only to the `staging` network. Its existing Dockerfile healthcheck calls `/health`. With no configured production model artifact, the expected health response is HTTP 200 with `serviceStatus: RUNNING`, `modelStatus: UNAVAILABLE`, and `ready: false`.

`/predict` must return `MODEL_NOT_CONFIGURED` in that state. It must not synthesize a normal probability response.

Connecting a real model artifact and a real OpenAI API key are follow-up work. Do not commit either artifact or any secret value.

Rollback is soft: set the Journey-related feature flags to `false` and run the stack without the `journey` profile.
