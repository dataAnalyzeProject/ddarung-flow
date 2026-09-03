# Claude Runtime Profile R1

## Purpose

This is the Claude Code provider adapter for [`EXECUTION_HARNESS_R1.md`](EXECUTION_HARNESS_R1.md). It does not replace or duplicate the lifecycle, review/fix loop, visual/asset protocol, or release gates defined there. It records only what is actually true about running that lifecycle on Claude Code, discovered at execution time rather than assumed.

Codex's `Sol/Terra/Luna` model family and `medium/high/xhigh/max` effort tiers do not exist on Claude Code. Do not record them as if they applied. Where a Codex-authored task contract requests them, translate the request to the closest applicable rule below and record `REQUESTED_ROLE`, `ACTUAL_MODEL`, `FALLBACK_REASON`, and `EFFORT_OVERRIDE` in evidence.

## Local `CLAUDE.md` boundary

Root `CLAUDE.md` in this repository is a local-only session bootstrap, excluded from Git via this clone's `.git/info/exclude` (`/CLAUDE.md`) — a per-clone, unpushed exclusion list, not a committed `.gitignore` rule. It is not present on `origin/main` and must not be added, force-tracked, or overwritten by this profile or by any task that reads it, regardless of which exclusion mechanism a given clone uses. This profile is the public, repo-tracked source of truth; the local bootstrap is expected to point here (directly or via `AGENTS.md`) rather than duplicate this content.

## Capability discovery

At `PRECHECK`, discover rather than assume:

- whether `AGENTS.md` and this profile were loaded as project instructions;
- whether the `Agent` tool (or equivalent fresh-context subagent mechanism) is available, and which models it exposes;
- whether a per-agent reasoning-effort or model-variant override is exposed to the caller (as of this writing it is not: the `Agent` tool accepts a `model` enum of `sonnet`/`opus`/`haiku`/`fable` and no effort parameter);
- browser automation available (an in-app browser MCP for staging/preview access, and optionally a real-Chrome extension MCP if connected);
- whether a local Playwright installation (or an on-demand `npx playwright` install with cached Chromium/Chromium-headless-shell builds) can drive a real browser from the terminal;
- whether a Google Drive for Desktop / File Stream mount exists and is writable;
- which Notion MCP connections are active and whether any of them expose a binary/file-upload primitive distinct from plain text or base64 parameters;
- `gh` CLI authentication and scopes.

Record `REQUESTED_ROLE`/`ACTUAL_MODEL`/`FALLBACK_REASON` whenever a task-requested route cannot be applied literally (`REQUESTED_ROLE` here is the same field `EXECUTION_HARNESS_R1.md`/`MODEL_ROUTING_R1.md` call `REQUESTED_MODEL` — this profile uses one name, `REQUESTED_ROLE`, since Claude routes by role rather than by a Codex model name).

## Agent / model mapping

| Role | Requested rule | Actual mechanism |
|---|---|---|
| Orchestrator | Sonnet-family default | The invoking session itself; escalate only on repeated cross-layer failure if a stronger model is actually selectable |
| Implementer | Sonnet-family | Same session, or an `Agent` subagent with `model: "sonnet"` |
| Independent Reviewer | Fresh-context agent, Opus-family preferred for P0/final acceptance | `Agent` tool subagent (separate context, does not receive the implementer's conclusions); `model: "opus"` when available, else `model: "sonnet"` with `FALLBACK_REASON` recorded |
| QA / log triage | Sonnet-family, fresh-context | `Agent` tool subagent, `model: "sonnet"` |
| Visual Reviewer | Fresh-context, Opus-family preferred | `Agent` tool subagent; requires browser/Playwright evidence handed to it, since a subagent has no independent browser session unless one is explicitly wired in |
| Release / Closer | Sonnet-family | Orchestrator session or a `sonnet` subagent |

`EFFORT_OVERRIDE = UNAVAILABLE` for every role above — the `Agent` tool exposes a `model` selector but no per-call reasoning-effort or model-variant parameter, so an orchestrator cannot set effort per dispatch. (A given subagent's own definition may carry a fixed effort/model outside the caller's control; that is not a caller-facing override and should not be reported as one.) Do not record a requested effort tier as if it were applied per call.

Fresh-context dispatch is real and verified: an `Agent` tool call starts with no memory of the parent conversation and must re-read the Notion task and repo docs itself to report a role opinion.

If the `Agent` mechanism is unavailable, or a dispatched subagent's tool scope cannot actually reach the evidence it needs to review (e.g. no repo access, no browser), do not count a same-session pass as an automatic independent PASS. Record the exact limitation and `FALLBACK_REASON`, then have the orchestrator perform an explicit, clearly-labeled same-session fresh-context pass instead — never the same session that authored the change under review. A same-session pass never satisfies a P0 or final-acceptance independent review gate regardless of labeling; if the orchestrator and the implementer are the same session for that class of task, this is not a valid fallback and routes to the harness's STOP condition for independent review being actually unavailable.

## Browser / Playwright

An in-app browser MCP can navigate to and capture a running staging/preview URL directly; treat it as sufficient for DOM/console/title checks but **not** as a source of durable evidence by itself — its screenshot action returns an inline image with no confirmed file-path or byte-accessible export in this profile's tool surface.

When local Playwright is available (verify via `npx playwright --version`; if browsers are missing, `npx playwright install` — or reuse an already-cached Chromium build under the platform's Playwright cache directory and pass `executablePath` explicitly if the default headless-shell channel is missing), prefer it for durable capture:

- load the target URL with `waitUntil: "networkidle"`;
- assert `title`, a DOM landmark (e.g. a known root element), and an empty/expected console-error list;
- call `page.screenshot({ path })` to a real local file **outside the repository**;
- record the file's byte size and SHA-256.

Do not commit capture files to the repository.

## Durable evidence — Claude Runtime

Local-only evidence (a path that exists solely on the machine that captured it) is never sufficient to close a task. In priority order:

### Primary: `DIRECT_DRIVE`

Re-verify at execution time that a Google Drive for Desktop / File Stream mount exists and is writable (the verified candidate on this machine is `G:\내 드라이브`; do not assume the path is stable across machines — re-verify it every time).

```plain text
LOCAL_CAPTURED
  -> DRIVE_PATH_WRITTEN
  -> DRIVE_SYNC_VERIFIED
  -> DRIVE_FILE_ID_RESOLVED
  -> NOTION_MANIFEST_RECORDED
  -> DURABLE_EVIDENCE_PASS
```

A file merely existing under the mount is not `DURABLE_EVIDENCE_PASS`. After writing, re-query the connected Drive tool (search/list by filename) to confirm sync completed and to resolve an actual file ID/URL before recording PASS. Never overwrite an existing evidence file or folder.

### Fallback 1: `NOTION_ATTACHMENT`

Some Notion MCP connections expose a two-step upload primitive: a call that returns a short-lived upload URL plus required headers, followed by exactly one multipart/form-data HTTP POST carrying the local file, followed by an attach call referencing the resulting upload ID. When available, perform that POST from the terminal (e.g. `curl -F "file=@<local path>" <upload_url>` with the returned headers) so the file's bytes never pass through the model's own text/tool-call channel. Passing a file as inline base64/text through a tool-call parameter is not an acceptable substitute for this fallback: in this profile's own capability discovery, a small (~13 KB) base64 payload relayed out through the model's own context and back came back shorter than what was sent, with a different SHA-256, and no error was raised at any step. Treat that channel as unreliable for evidence-bearing bytes regardless of size, and always prefer a path (`curl`/HTTP POST, direct filesystem write, or a tool parameter that takes a local path) that never requires the model to retype or re-emit the bytes.

### Fallback 2: `BROWSER_FILE_UPLOAD`

Use only when a browser automation tool exposes a genuine local-file-path upload (a `paths`/`set_input_files`-style parameter that reads bytes directly from disk into a web file input), not a "re-upload a previously captured screenshot by internal ID" helper — the latter cannot accept an arbitrary evidence file and is not a substitute.

### `DURABLE_EVIDENCE_HOLD`

If none of the above is actually available at execution time, stop and record `DURABLE_EVIDENCE_HOLD`. Per `EXECUTION_HARNESS_R1.md`, this blocks PR publication and merge, not only close — do not advance past this point on local-path-only evidence. `DURABLE_EVIDENCE_PASS`/`DURABLE_EVIDENCE_HOLD` here are this profile's names for the same gate `EXECUTION_HARNESS_R1.md` (R1.3) calls `DURABLE_VISUAL_EVIDENCE_PASS`/`DURABLE_VISUAL_EVIDENCE_UNAVAILABLE`; use whichever vocabulary the invoking task contract specifies, and do not treat a PASS recorded under one name as not covering the other.

## Visual skill boundary

If `impeccable` or `web-design-guidelines` are not installed as skills, record `SKILL_UNAVAILABLE` for each and execute the `FE_VISUAL_PROTOCOL_R1` explicit checklist by hand (hierarchy, dimensions/spacing/density, typography/wrapping/alignment, responsive reflow/overflow, keyboard/focus, semantics/labels/contrast, factual state boundaries). Do not claim a skill ran when it did not.

## Image generation boundary

```plain text
IMAGE_GENERATION = UNSUPPORTED
ASSET_PRODUCER = EXTERNAL
```

This runtime does not generate or edit images. An `ASSET_GAP` discovered mid-task routes to `EXTERNAL_ASSET_REQUIRED` then `HOLD`; it is not itself a release blocker for unrelated work, and it never authorizes a static/generated image standing in for factual map/route/probability/inventory/time/distance/provider data.

## GitHub / release

`gh` CLI and `git` are used exactly as the Codex harness describes — no adapter needed. Re-check `origin/main`, open PRs, and overlap immediately before commit and again immediately before merge, per `EXECUTION_HARNESS_R1.md`. This profile grants no merge authorization beyond what the current Notion task already grants.

## Human-only gate

Unchanged from `EXECUTION_HARNESS_R1.md`: password/MFA/CAPTCHA/account-recovery/new-OAuth-scope and manual operational checks (e.g. a provider console quota/billing check) remain `AUTH_MANUAL_REQUIRED` or an explicit human gate. Do not record them as AI-verified.
