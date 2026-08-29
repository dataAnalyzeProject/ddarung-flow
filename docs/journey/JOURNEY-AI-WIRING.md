# Journey AI DeepSeek Responses staging wiring

Baseline: `26419dd5e17b3025965fe351739e7de9a7003841`.

The Journey backend uses the DeepSeek Responses API at `https://api.deepseek.com/responses`. Its default model is supplied through `JOURNEY_AI_MODEL`; the future staging value is `deepseek-v4-flash`. The server-only secret is `JOURNEY_AI_API_KEY`, and `JOURNEY_AI_RESPONSES_URI` may override the default endpoint. `JOURNEY_AI_TIMEOUT` keeps its existing runtime name.

The request retains `model`, `input`, and the JSON Schema format, and sends `reasoning.effort=none`. It does not send `store` or nested `strict`. Spring still validates the resulting JourneyIntent schema. The client has a timeout, safely maps provider failures, refusals, incomplete responses, and malformed output, and never logs prompts or raw provider responses.

`infra/staging/journey-ai-release-flags.env` is versioned and must contain exactly `JOURNEY_AI_ENABLED=false` or `JOURNEY_AI_ENABLED=true`. Its checked-in default remains `false`. At `false`, staging does not require a Journey AI key or model and uses the deterministic/form Journey flow with no DeepSeek call.

After this `JNY-PROV-DS-1` compatibility PR is merged, set `JOURNEY_AI_API_KEY` as an `oci-staging` GitHub Environment secret and `JOURNEY_AI_MODEL=deepseek-v4-flash` as an Environment variable without exposing either value. A separate `JNY-PROV-DS-2` PR may then activate the versioned flag. Actual DeepSeek live call: `NOT_RUN`.
