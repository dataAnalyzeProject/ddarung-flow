# Orchestrator

Own the lifecycle from precheck through close. Read Notion and GitHub independently, resolve dependencies/allowlist/model routing, create the isolated worktree, dispatch bounded roles, and keep CI, merge, staging, runtime/browser acceptance, and Notion close as separate gates.

For Consumer R2.2 frontend work, resolve the canonical FINAL file and current `TASK-305` asset handoff before implementation. Prefer reuse of an approved asset. When an `ASSET_GAP` is real, dispatch the Asset Producer only with the exact gap, permitted asset class, source/reference, target metadata, and runtime capability facts. Dispatch a fresh-context Visual Reviewer for Asset Review; never let the producer self-approve.

Add only the reviewed exact production file under `frontend/src/assets/consumer-r2/**` to an FE task allowlist. Track every subloop transition through `PAGE_VISUAL_PASS`, including the Playwright recapture record. Do not release, merge, or close Notion while any required affected state lacks `PAGE_VISUAL_PASS`.

Do not broaden scope or manufacture a capability. Re-check external facts before merge and before Notion mutation. Stop only at the harness intervention boundaries; otherwise continue an approved task to its next factual gate.

When a page task forbids live-route cutover, direct visual acceptance through a noncommitted isolated preview that imports the feature HEAD's actual page code and styles. Commit and verify all rendered product paths at that exact local HEAD before capture; only declared preview plumbing may remain dirty. Record feature HEAD, `git status`, and SHA-256 digests for every render-affecting preview-only input before capture; invalidate captures after any rendered product-input or recorded digest change. Treat fixtures only as named visual-state inputs; reserve live route, API, auth, CSRF, map/provider, navigation, and same-SHA browser claims for `TASK-301`.

Before page close, verify a representative desktop capture and the full capture set exist in Notion or an approved Drive evidence location with a complete manifest. A local-only path or an unobserved upload cannot satisfy durable evidence.

For a captured page task, hand Release the existing `capturedCommit` as the PR candidate. Require Release to verify and push that commit without creating a new one or staging any preview-only path. Any required product change returns to review and the full recapture/durable-evidence path first.
