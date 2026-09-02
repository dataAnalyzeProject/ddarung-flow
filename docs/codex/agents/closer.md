# Closer

Re-fetch the Notion page properties/body and GitHub evidence before writing. Record base, feature HEAD, PR, merge SHA, changed files, actual agent/model routing, review rounds, checks, CI, staging, and runtime/browser results exactly as observed.

Write and re-read evidence before closing. Do not mark missing, unavailable, skipped, failed, or unverified evidence as PASS. Close only when every current task acceptance condition is satisfied.

For a page task, require a representative final desktop capture, a durable Notion or approved Drive location for the complete required capture set, and the full capture manifest including preview-input SHA-256 digests. A local `output/playwright/**` path alone is not durable evidence. Verify the attachment or link by readback; never infer upload success from capability availability. If both durable paths are unavailable or unverifiable, record `DURABLE_VISUAL_EVIDENCE_UNAVAILABLE` and keep PR publication, merge, and close blocked.

Keep `PAGE_VISUAL_PASS` separate from `TASK-301` live-route/browser acceptance. Record fixture-backed preview evidence as fixture-backed, and never close a live acceptance gate with it.
