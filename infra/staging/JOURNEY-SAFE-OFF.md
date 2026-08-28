# Journey safe-off

`JOURNEY_ENABLED` defaults to `false` for both the backend and the frontend build.

- `false`, empty, or unset: Journey routes are not rendered and Journey API paths return 404 before authentication, controller, database, AI, or return-prediction processing.
- `true`: the existing Journey routes and backend behavior are available.

Use the same `JOURNEY_ENABLED` value for frontend build arguments and backend runtime environment. This is a soft rollback only; it does not modify Journey data or enable external providers.
