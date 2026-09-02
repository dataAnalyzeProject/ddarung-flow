# Execution Harness R1.3

## Purpose

This is the default single-session lifecycle for an approved Ddarung Flow task. It coordinates native Codex subagents when the active runtime exposes them; otherwise the orchestrator performs fresh-context, independent passes in the same session. It does not grant product scope, secrets, or permissions absent from the current Notion task.

## Capability discovery

At `PRECHECK`, record the actual Codex build and discover rather than assume:

- `AGENTS.md` instruction loading and skill discovery;
- project/repository configuration fields accepted by the installed build;
- native multi-agent delegation and its exact schema;
- per-agent model and reasoning-effort overrides;
- worktree isolation;
- browser, computer-use, or Playwright availability;
- Google Drive access to the current FINAL reference and `TASK-305` manifest;
- actual image-generation or image-editing capability.
- Notion binary/file attachment capability and an approved durable evidence location.

Do not add speculative hooks, agent APIs, configuration fields, or CLI flags. If requested routing cannot be applied, record `REQUESTED_MODEL`, `ACTUAL_MODEL`, and `FALLBACK_REASON`. The current implementation needs no repository-local Codex config: the runtime already provides instruction loading, native delegation, model/effort selection, worktrees, browser tools, and skills.

## State machine

```text
PRECHECK
  -> PLAN_AND_ALLOWLIST
  -> IMPLEMENT
  -> INDEPENDENT_REVIEW
  -> FIX
  -> RE_REVIEW
  -> LOCAL_ACCEPTANCE
  -> DURABLE_VISUAL_EVIDENCE_WHEN_REQUIRED
  -> COMMIT_PUSH_PR
  -> EXACT_HEAD_CI
  -> MERGE
  -> SAME_SHA_CI_STAGING
  -> RUNTIME_OR_BROWSER_ACCEPTANCE
  -> NOTION_EVIDENCE
  -> CLOSE
```

`FIX -> RE_REVIEW` repeats as needed. When review has no blocker or major finding, skip `FIX` and advance to `LOCAL_ACCEPTANCE`. An approved task does not stop merely because a PR is ready.

## PRECHECK

Read the current Notion task properties and body, parent/master task, predecessors, and referenced frozen contracts. Re-fetch GitHub `main`, all open PRs without a state filter narrower than open, exact-head CI, relevant deployment state, and the proposed starter commit.

Record:

- task ID, state, last-edited timestamp, owner, predecessor status;
- base SHA and whether the starter is exact or materially compatible;
- allowlist, forbidden paths, required tests, evidence, and release gates;
- open PR changed files and semantic overlap;
- capability inventory and requested/actual role routing.
- resolved canonical FINAL reference and approved-asset handoff for frontend visual work.

Return `STATE_SYNC_REQUIRED` without editing when Notion and GitHub materially disagree or an open PR overlaps the allowlist. A harmless baseline advance must still be explained and checked for semantic overlap.

## PLAN_AND_ALLOWLIST

Translate the task into a closed changed-file allowlist and explicit success checks. Use a dedicated worktree and task branch from the verified base. Preserve unrelated and user-owned files. If a necessary file is outside the contract, stop for a contract decision rather than silently expanding scope.

For `TASK-291` through `TASK-301`, an exact file under `frontend/src/assets/consumer-r2/**` may be added to the task allowlist only when precheck resolves either an approved `TASK-305` manifest row or a current `ASSET_REVIEW_PASS` for that file. Record the exact production path; a directory-wide wildcard is not an authorization to add arbitrary assets.

## IMPLEMENT and review/fix loop

The implementer makes the smallest coherent change and adds only required tests. The implementer never self-assigns PASS.

The independent reviewer starts from the Notion task, frozen parents, and the diff rather than the implementer's conclusion. Findings require severity, file/line, violated contract, effect, and a concrete verification step:

- `BLOCKER`: unsafe, out of contract, factually false, security-sensitive, or impossible to release;
- `MAJOR`: required behavior, acceptance, test, or release correctness is missing;
- `MINOR`: non-blocking unless it affects correctness, factual integrity, security, accessibility, or visual acceptance.

Loop:

```text
IMPLEMENT -> INDEPENDENT_REVIEW
finding -> FIX -> affected tests -> RE_REVIEW
```

Release requires `BLOCKER=0` and `MAJOR=0`. Fix consequential minors. Preference-only minors may be recorded and accepted. One finding and its first recurrence after repair do not escalate the model. Raise the responsible role by one supported effort/model step within the task ceiling only when the same structural `BLOCKER` or `MAJOR` recurs twice after repair; a `MINOR` never escalates the model. Use GPT-5.6 Sol `max` only within the task ceiling when either an xhigh review has not resolved a repeatedly recurring structural `BLOCKER` or `MAJOR`, or final integration has an actual cross-layer conflict, and record `MAX_ESCALATION_REASON`. Five total review rounds is the hard bound. At round five, an external or contract-dependent finding becomes HOLD; a still-fixable in-scope defect becomes `REVIEW_LIMIT_REACHED` and fails release acceptance without being mislabeled as an external HOLD.

## Conditional frontend asset subloop

The ordinary implement-review-fix lifecycle remains authoritative. When a Consumer R2.2 task discovers an `ASSET_GAP`, the orchestrator adds this bounded subloop without skipping or replacing page review:

```text
GAP_RECORDED
  -> PRODUCED
  -> ASSET_REVIEW_PASS
  -> PRODUCTION_COPY_APPROVED
  -> APPLIED
  -> RECAPTURED
  -> PAGE_VISUAL_PASS
```

Resolve and reuse an approved `TASK-305` asset before generating a new one. The Asset Producer may produce only within the Asset Protocol and only when the active runtime exposes real image-generation or image-editing capability. Without that capability, return `ASSET_GENERATION_REQUIRED`; never claim `PRODUCED`. A fresh-context Visual Reviewer performs independent Asset Review. The production copy cannot be approved or applied before `ASSET_REVIEW_PASS`.

After application, Playwright must recapture the affected page and record `screenId`, state, viewport, canonical reference file and revision, capture path, captured commit, and applied asset identifiers. Asset Review PASS is not page acceptance. Release, merge, and Notion close remain blocked until every required affected state reaches `PAGE_VISUAL_PASS`. Unrelated in-scope work may continue while the subloop is waiting.

## LOCAL_ACCEPTANCE

Run the task's focused tests, full relevant tests, build, `git diff --check`, changed-file allowlist check, and any provider/runtime smoke. Keep failure states factual. A test/build/CI failure is not itself a STOP condition; triage an in-scope cause, fix it, and repeat affected review and checks.

For frontend tasks, apply the visual and asset protocols before release acceptance. An affected Consumer R2.2 page is locally acceptable only after `PAGE_VISUAL_PASS` at the required states and viewports.

## Isolated visual preview before live-route cutover

For Consumer R2.2 page tasks `TASK-293` through `TASK-300`, use a noncommitted isolated preview when the current task forbids `App.jsx` or production-route cutover. The preview must import the feature HEAD's actual page, components, styles, and shared foundation. Preview-only mount, router, and deterministic fixture plumbing stay outside the product commit and changed-file allowlist.

Before every capture, commit the product page, component, CSS, and shared-foundation changes into the local feature HEAD. Verify that every rendered product path is clean and byte-identical to that commit; only the declared preview mount/router/fixture paths may remain uncommitted. Record the feature HEAD and `git status`, identify those preview-only paths, and distinguish them from the product diff. Record a SHA-256 content digest for every render-affecting preview-only mount, router, and fixture input. The capture record's `capturedCommit` is this exact feature HEAD. Any later change to a rendered product input or any recorded preview-input digest invalidates the capture and requires a new feature commit when applicable, plus recapture.

The preview fixture may reproduce visual states but is not evidence for live API, authentication, CSRF, map SDK, route, inventory, probability, time, distance, provider, deep-link, refresh, or back-navigation behavior. Do not mutate product code, `App.jsx`, routes, API/auth semantics, or provider wiring to make the preview work.

```text
CANONICAL FINAL
  -> FEATURE PAGE
  -> ISOLATED PREVIEW
  -> PLAYWRIGHT CAPTURE
  -> VISUAL REVIEW
  -> FIX AND RECAPTURE
  -> PAGE_VISUAL_PASS
```

Each changed screen requires success and at least its most important non-success state at every required desktop, tablet, and mobile viewport, unless the current task requires more. Compare the canonical FINAL and preview at the same screen, state, viewport, data state, and interaction point. `PAGE_VISUAL_PASS` permits the page task to continue through its own release gates; it never satisfies `TASK-301` live-route or staging browser acceptance.

## Durable visual evidence

A local `output/playwright/**` path alone is not durable close evidence. After final `PAGE_VISUAL_PASS`, preserve at least one representative final desktop capture and a traceable location for the full required capture set. Record this manifest:

`taskId / screenId / state / viewport / width / height / interactionPoint / fixtureOrSource / previewInputDigests / canonical reference file ID + filename + revision / capturePathOrDurableURL / capturedCommit / appliedAssetIds`

Use the verified Notion binary/file attachment capability first. If it is unavailable, upload to an approved Google Drive evidence location and record an actually accessible file or folder link plus the manifest in Notion. If neither path succeeds or readback cannot verify it, return `DURABLE_VISUAL_EVIDENCE_UNAVAILABLE`; PR publication, merge, and close remain blocked until a verified fallback succeeds. Never declare `DURABLE_VISUAL_EVIDENCE_PASS` or claim an upload that was not observed.

For tasks that require page captures, this durable-evidence step occurs after local visual acceptance and before `COMMIT_PUSH_PR`; the local feature commit used for capture becomes the PR candidate. If review or CI later changes a rendered input, invalidate the evidence, create a new feature HEAD, and repeat capture, visual review, and durable preservation before merge. The later `NOTION_EVIDENCE` stage records and re-reads the already-preserved artifacts together with final GitHub release facts.

For these captured page tasks, R1.3 specializes the existing Release role: `COMMIT_PUSH_PR` verifies and pushes the already-created `capturedCommit`; it does not create another commit. The Release role must confirm the product worktree is clean at that commit, exclude every preview-only path from staging, and fail rather than commit preview plumbing. A new product commit is allowed only after returning through affected review, recapture, `PAGE_VISUAL_PASS`, and durable-evidence replacement.

## Release transaction

Before commit and again immediately before merge, re-fetch current `main` and open PRs. If `main` advanced, inspect file and semantic overlap, update the branch if needed, and repeat relevant tests, review, and exact-head CI.

Merge without a new confirmation only when the current approved task grants standing authorization and all are true:

- contract, scope, predecessor, and allowlist PASS;
- `BLOCKER=0`, `MAJOR=0`;
- required tests, build, and diff checks PASS;
- frontend visual/browser acceptance PASS when required, including `PAGE_VISUAL_PASS` for every unresolved asset subloop;
- durable visual evidence PASS for every frontend page task that requires captures;
- PR exact-head CI SUCCESS;
- current `main` has no conflict or material overlap.

After merge, identify the actual merge SHA. Require CI at that exact SHA and same-SHA Staging CD success. Runtime or browser acceptance is a separate claim and must be executed when the task requires it. Never equate PR CI, merge, deployment, or browser acceptance.

## STOP conditions

Stop with the exact blocker only for:

- material Notion/GitHub mismatch;
- concurrent PR allowlist overlap;
- a required secret or credential does not exist;
- password, MFA, CAPTCHA, account recovery, or unexpected OAuth scope;
- provider outage preventing required acceptance;
- unresolved canonical FINAL reference or `TASK-305` manifest ambiguity;
- an asset handoff whose Drive master, optimized derivative, and Git production path cannot be reconciled;
- Notion attachment and the approved Drive fallback both unavailable or unverifiable for required durable visual evidence (`DURABLE_VISUAL_EVIDENCE_UNAVAILABLE`);
- a new product or contract decision;
- the bounded five-round review loop ending with an unresolved blocker/major that requires external or contract judgment.

Do not bypass authentication or expose secrets. If a Google account chooser shows only previously approved accounts, select the first listed account and continue. Ordinary already-approved OAuth consent may proceed. Password, MFA, CAPTCHA, account recovery, or a new/unexpected OAuth scope emits `AUTH_MANUAL_REQUIRED`. Continue all acceptance that does not require the blocked authentication.

## NOTION_EVIDENCE and CLOSE

Re-fetch the Notion page and GitHub facts immediately before writing. Record only observed evidence:

- base SHA, final feature HEAD, PR URL, merge SHA, changed files;
- actual multi-agent capability used;
- requested/actual/fallback model routing;
- dry-run or task resolution, review-loop count and final severities;
- commands and results, exact-head CI, merge-SHA CI, same-SHA Staging;
- runtime/browser acceptance or its exact unavailable/blocker state.
- canonical FINAL reference resolution, asset provenance/handoff, final ASSET_GAP state, and Playwright capture trace when applicable.
- representative desktop capture, full durable capture-set location, and manifest when page visual acceptance applies.

Write evidence first, re-read it, then close only when all acceptance gates are satisfied. A Notion status does not redefine GitHub facts, and GitHub success does not close Notion automatically.

## Role instructions

Use the role contracts in [`agents/`](agents/): orchestrator, implementer, reviewer, QA, Asset Producer, visual reviewer, release, and closer. Subagents receive only the task facts, allowlist, forbidden scope, acceptance criteria, and necessary evidence; do not pass secrets or unrelated workspace context.

## Historical harness installation snapshot

The examples below document the original R1 installation check only. They do not override a current Notion task, current GitHub state, or R1.3 release gates.

The harness installation is verified without product edits by resolving:

- `TASK-273`: lifecycle through `COMMIT_PUSH_PR -> EXACT_HEAD_CI`, then stop before merge because its newer task-specific prompt says `Do not merge`; predecessor `TASK-304`; allowlist `backend/src/main/java/com/ddarungflow/map/RouteCandidateService.java`, `backend/src/main/java/com/ddarungflow/map/MapPredictionService.java`, `backend/src/main/java/com/ddarungflow/map/PredictionApiDtos.java`, optional `backend/src/main/java/com/ddarungflow/map/MapApiDtos.java`, `backend/src/test/java/com/ddarungflow/map/RouteCandidateServiceTest.java`, `backend/src/test/java/com/ddarungflow/map/MapPredictionServiceTest.java`, and the existing prediction route contract test `backend/src/test/java/com/ddarungflow/controller/MapControllerTest.java`; resolve implementation and review routes from the current task difficulty and Model Routing role defaults; targeted and full backend tests plus diff check. Merge, same-SHA staging, and runtime gates remain unresolved future gates, not performed dry-run results.
- `TASK-291`: the installation-time snapshot had a PR-only prompt and its then-current predecessor/allowlist facts. Always re-resolve its current Notion contract and GitHub actual before acting. R1.2 additionally requires the conditional exact-file asset allowlist, Asset Subloop, and `PAGE_VISUAL_PASS` gate when applicable. R1.3 adds isolated-preview and durable-capture rules without weakening those gates.
