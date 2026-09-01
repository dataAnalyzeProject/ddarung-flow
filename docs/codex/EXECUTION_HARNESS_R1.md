# Execution Harness R1

## Purpose

This is the default single-session lifecycle for an approved Ddarung Flow task. It coordinates native Codex subagents when the active runtime exposes them; otherwise the orchestrator performs fresh-context, independent passes in the same session. It does not grant product scope, secrets, or permissions absent from the current Notion task.

## Capability discovery

At `PRECHECK`, record the actual Codex build and discover rather than assume:

- `AGENTS.md` instruction loading and skill discovery;
- project/repository configuration fields accepted by the installed build;
- native multi-agent delegation and its exact schema;
- per-agent model and reasoning-effort overrides;
- worktree isolation;
- browser, computer-use, or Playwright availability.

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

Return `STATE_SYNC_REQUIRED` without editing when Notion and GitHub materially disagree or an open PR overlaps the allowlist. A harmless baseline advance must still be explained and checked for semantic overlap.

## PLAN_AND_ALLOWLIST

Translate the task into a closed changed-file allowlist and explicit success checks. Use a dedicated worktree and task branch from the verified base. Preserve unrelated and user-owned files. If a necessary file is outside the contract, stop for a contract decision rather than silently expanding scope.

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

Release requires `BLOCKER=0` and `MAJOR=0`. Fix consequential minors. Preference-only minors may be recorded and accepted. If the same finding repeats twice, raise the responsible role by one supported effort/model step within the task ceiling. A structural finding still present on the third review receives a GPT-5.6 Sol `max` review when supported. Five total review rounds is the hard bound. At round five, an external or contract-dependent finding becomes HOLD; a still-fixable in-scope defect becomes `REVIEW_LIMIT_REACHED` and fails release acceptance without being mislabeled as an external HOLD.

## LOCAL_ACCEPTANCE

Run the task's focused tests, full relevant tests, build, `git diff --check`, changed-file allowlist check, and any provider/runtime smoke. Keep failure states factual. A test/build/CI failure is not itself a STOP condition; triage an in-scope cause, fix it, and repeat affected review and checks.

For frontend tasks, apply the visual and asset protocols before release acceptance.

## Release transaction

Before commit and again immediately before merge, re-fetch current `main` and open PRs. If `main` advanced, inspect file and semantic overlap, update the branch if needed, and repeat relevant tests, review, and exact-head CI.

Merge without a new confirmation only when the current approved task grants standing authorization and all are true:

- contract, scope, predecessor, and allowlist PASS;
- `BLOCKER=0`, `MAJOR=0`;
- required tests, build, and diff checks PASS;
- frontend visual/browser acceptance PASS when required;
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

Write evidence first, re-read it, then close only when all acceptance gates are satisfied. A Notion status does not redefine GitHub facts, and GitHub success does not close Notion automatically.

## Role instructions

Use the role contracts in [`agents/`](agents/): orchestrator, implementer, reviewer, QA, visual reviewer, release, and closer. Subagents receive only the task facts, allowlist, forbidden scope, acceptance criteria, and necessary evidence; do not pass secrets or unrelated workspace context.

## Harness dry-run contract

The harness installation is verified without product edits by resolving:

- `TASK-273`: lifecycle through `COMMIT_PUSH_PR -> EXACT_HEAD_CI`, then stop before merge because its newer task-specific prompt says `Do not merge`; predecessor `TASK-304`; allowlist `backend/src/main/java/com/ddarungflow/map/RouteCandidateService.java`, `backend/src/main/java/com/ddarungflow/map/MapPredictionService.java`, `backend/src/main/java/com/ddarungflow/map/PredictionApiDtos.java`, optional `backend/src/main/java/com/ddarungflow/map/MapApiDtos.java`, `backend/src/test/java/com/ddarungflow/map/RouteCandidateServiceTest.java`, `backend/src/test/java/com/ddarungflow/map/MapPredictionServiceTest.java`, and the existing prediction route contract test `backend/src/test/java/com/ddarungflow/controller/MapControllerTest.java`; Sol high implementer, Sol xhigh reviewer, ceiling max; targeted and full backend tests plus diff check. Merge, same-SHA staging, and runtime gates remain unresolved future gates, not performed dry-run results.
- `TASK-291`: lifecycle through `COMMIT_PUSH_PR -> EXACT_HEAD_CI`, then stop before merge because its newer task-specific prompt says `merge하지 않는다`; predecessors `TASK-304` and `TASK-305`; allowlist only new `frontend/src/features/consumer-r2/shared/**`, new `frontend/src/features/consumer-r2/styles/**`, and new focused foundation tests; Sol xhigh implementer, Visual Reviewer Sol max; automatic visual and asset protocols with desktop/tablet/mobile plus success/non-success captures; an asset gap is mandatory work, never a visual PASS exception. Merge and same-SHA staging remain unresolved future gates.
