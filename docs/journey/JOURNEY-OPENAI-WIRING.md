# Journey OpenAI Responses staging wiring

Baseline: `a193e3548ec962cc1c178d0e0fcbff9de03e9ed5`.

The Journey backend's OpenAI boundary is the Responses API. It uses a server-only `OPENAI_API_KEY`, `store=false`, and Structured Outputs with a strict JSON schema. The client has a timeout and falls back for non-success responses, refusals, or malformed output; prompts and responses are not logged.

`infra/staging/journey-ai-release-flags.env` is versioned and must contain exactly `JOURNEY_AI_ENABLED=false` or `JOURNEY_AI_ENABLED=true`. Its checked-in default is `false`. At `false`, staging does not require `OPENAI_API_KEY` or `OPENAI_MODEL`, and Journey remains on its deterministic/form flow with no OpenAI call.

For the separate activation PR `JNY-PROV-AI-2`, configure `OPENAI_API_KEY` as the `oci-staging` GitHub Environment secret and `OPENAI_MODEL` as its Environment variable. `OPENAI_RESPONSES_URI` may use the backend default or a GitHub Environment variable override; `JOURNEY_AI_TIMEOUT` uses the backend default unless an Environment variable override is set. If the flag is `true`, both key and model must be non-empty before deployment proceeds.

This `JNY-PROV-AI-1` wiring change does not activate the provider. Actual live call: `NOT_RUN`.
