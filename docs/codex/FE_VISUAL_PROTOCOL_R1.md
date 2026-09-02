# Frontend Visual Protocol R1.3

Apply this protocol automatically to Consumer R2.2 frontend tasks `TASK-291` through `TASK-301`.

## Canonical reference

Before implementation or review, resolve the exact FINAL file through the Asset Protocol resolver for each `screenId` and state. Record the Drive file ID, canonical filename, and revision or modified time. A stale Drive index or narrative document cannot override the current manifest Sheet plus actual FINAL folder file.

## Loop

```text
CANONICAL FINAL reference
  -> IMPLEMENT
  -> PLAYWRIGHT CAPTURE
  -> VISUAL REVIEW
  -> FIX
  -> RECAPTURE
```

Use the approved FINAL state and actual page at the same viewport, data/state, and interaction point. For each changed screen, capture success and at least the most important non-success state at every required desktop, tablet, and mobile viewport.

## Isolated preview before cutover

For page tasks `TASK-293` through `TASK-300`, when the task forbids `App.jsx` or production-route cutover, mount the feature HEAD's real page, components, CSS, and shared foundation in a noncommitted isolated preview. Preview-only mount/router/fixture files are validation plumbing: keep them out of the product diff and PR allowlist, and never change production routes or API/auth/provider semantics to accommodate them.

Immediately before capture, commit every rendered product page/component/CSS/shared-foundation path to the local feature HEAD and verify those paths are clean and byte-identical to it. Only declared preview mount/router/fixture paths may remain uncommitted. Record `git status`, feature HEAD, preview-only paths, product changed paths, and a SHA-256 content digest for every render-affecting preview-only input. Set `capturedCommit` to that exact feature HEAD. Any rendered product-input or recorded preview-input digest change invalidates every affected capture; a product change also requires a new feature commit before recapture.

Deterministic fixtures may reproduce named visual states. Mark `fixtureOrSource` explicitly and never use fixture output as live API, authentication, CSRF, map SDK, route, probability, inventory, time, distance, provider, deep-link, refresh, or back-navigation evidence. Those remain `TASK-301` live-wiring and same-SHA staging browser gates.

Each capture record must contain:

- task ID, `screenId`, and state;
- viewport name, width, and height;
- interaction point and data-state fixture or source;
- reference file ID, canonical filename, and reference revision or modified time;
- capture path and captured Git commit;
- applied asset IDs, or `NONE`.
- fixture or actual source classification.
- preview-only mount/router/fixture path and SHA-256 digest, or `NONE`.

## Durable evidence gate

After `PAGE_VISUAL_PASS`, keep at least one representative final desktop capture and place the full required capture set in a durable evidence location. A local `output/playwright/**` path is working evidence, not close evidence.

Use a verified Notion file attachment when supported. Otherwise use an approved Google Drive evidence folder and record an accessible file/folder link. The Notion record must include the representative capture, durable location, and the capture manifest. If attachment/upload capability is unavailable or the result cannot be read back, return `DURABLE_VISUAL_EVIDENCE_UNAVAILABLE`; do not publish the PR, merge, close, or declare `DURABLE_VISUAL_EVIDENCE_PASS` until a verified fallback succeeds.

Complete this gate before PR publication and merge. The captured local feature commit becomes the PR candidate. A later change to any rendered input requires a new feature HEAD, recapture, visual re-review, and durable evidence replacement.

## Review checklist

- information and state hierarchy;
- container width, section/card dimensions, spacing, and density;
- typography, wrapping, alignment, and selected/disabled states;
- responsive reflow and overflow;
- keyboard order, visible focus, semantics, labels, and contrast;
- factual status boundaries, including zero versus missing/unavailable;
- map/provider/AI/auth failures separated from one another.

Use the installed `impeccable` and `web-design-guidelines` skills when available. Record their actual use. If unavailable, record that and execute this explicit checklist; do not claim the skills ran.

An acceptance-impacting mismatch returns to immediate fix and recapture. “Roughly similar” is not PASS. A missing required asset is a visual failure and routes through the Asset Protocol.

`PAGE_VISUAL_PASS` is page-level design acceptance only. It does not imply that the production route renders the page or that live API/auth/provider behavior passed; `TASK-301` owns those claims.

When an `ASSET_GAP` exists, independent Asset Review must pass before the production copy is applied. After application, Playwright recaptures every affected required state/viewport and the Visual Reviewer performs a separate page review. `ASSET_REVIEW_PASS` never implies `PAGE_VISUAL_PASS`. Release, merge, and Notion close require the final page state.
