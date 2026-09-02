# Frontend Visual Protocol R1.2

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

Use the approved FINAL state and actual page at the same viewport, data/state, and interaction point. Capture at least desktop, tablet, and mobile. Cover success and at least the most important non-success state for each changed screen.

Each capture record must contain:

- task ID, `screenId`, and state;
- viewport name, width, and height;
- interaction point and data-state fixture or source;
- reference file ID, canonical filename, and reference revision or modified time;
- capture path and captured Git commit;
- applied asset IDs, or `NONE`.

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

When an `ASSET_GAP` exists, independent Asset Review must pass before the production copy is applied. After application, Playwright recaptures every affected required state/viewport and the Visual Reviewer performs a separate page review. `ASSET_REVIEW_PASS` never implies `PAGE_VISUAL_PASS`. Release, merge, and Notion close require the final page state.
