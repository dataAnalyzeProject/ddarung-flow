# Frontend Visual Protocol R1

Apply this protocol automatically to Consumer R2.2 frontend tasks `TASK-291` through `TASK-301`.

## Loop

```text
FINAL reference
  -> IMPLEMENT
  -> PLAYWRIGHT CAPTURE
  -> VISUAL REVIEW
  -> FIX
  -> RECAPTURE
```

Use the approved FINAL state and actual page at the same viewport, data/state, and interaction point. Capture at least desktop, tablet, and mobile. Cover success and at least the most important non-success state for each changed screen.

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
