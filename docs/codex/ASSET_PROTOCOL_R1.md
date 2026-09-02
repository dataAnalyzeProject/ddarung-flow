# Asset Protocol R1.2

Use the current `TASK-305` approved asset inventory before implementing Consumer R2.2 frontend presentation. This protocol adds a bounded asset subloop to the existing Execution Harness; it does not change product semantics or replace page-level visual review.

## Canonical FINAL reference resolver

Resolve the reference for each `screenId` and state in this order:

1. the current `TASK-305` contract and approval record;
2. the current FINAL manifest Sheet row for the exact `screenId` and state;
3. the actual file in the linked FINAL Drive folder.

The current Sheet row plus the actual folder file outrank a stale Drive index, overview document, copied link list, or historical filename. Record the file ID, canonical filename, revision or modified time, and resolver sources. If current sources disagree and cannot identify one exact file, stop with `CANONICAL_REFERENCE_AMBIGUOUS`; do not choose by appearance or filename alone.

## Approved asset handoff

For every reused or newly approved asset, keep one traceable handoff record:

- asset ID and approval state;
- Drive master file ID/path and revision;
- source/reference and provenance;
- master dimensions, transparency, and format;
- optimized derivative file ID/path, dimensions, and format;
- exact Git production path under `frontend/src/assets/consumer-r2/**`.

Drive owns the master. The current manifest owns inventory and approval. Git contains only the approved optimized production copy. A derivative is not approved merely because its master is approved; its dimensions, transparency, format, and visual fidelity must be reviewed.

## Conditional FE allowlist

For `TASK-291` through `TASK-301`, an exact production asset file may enter the task allowlist only when preflight finds either:

- an approved `TASK-305` manifest row whose handoff resolves to that exact path; or
- a new ASSET_GAP record that has reached `ASSET_REVIEW_PASS` and names that exact path.

Record each exact path. Do not use `frontend/src/assets/consumer-r2/**` as blanket permission to add or replace unrelated files.

## Boundaries

Assets may be decorative illustrations/backgrounds, empty-state artwork, supporting graphics, or required custom pictograms. Implement buttons, cards, forms, tables, text, and stateful UI as React/CSS.

Never generate or use static images to impersonate actual maps, routes, probabilities, inventory, time, distance, charts, provider results, or text-heavy UI. Do not substitute emoji, placeholders, arbitrary icons, or temporary CSS drawings and then claim visual PASS.

## ASSET_GAP state machine

Every newly discovered required asset creates an `ASSET_GAP` with `screenId`, state, placement, reason, reference file/crop, target dimensions or ratio, transparency, format, and proposed production path.

```text
GAP_RECORDED
  -> PRODUCED
  -> ASSET_REVIEW_PASS
  -> PRODUCTION_COPY_APPROVED
  -> APPLIED
  -> RECAPTURED
  -> PAGE_VISUAL_PASS
```

No state may be inferred or skipped. Record the evidence and actor for every transition. A rejected output returns to the preceding responsible step; retain the rejection and revision history.

## Asset Producer

The Asset Producer must inspect the canonical FINAL reference and current `TASK-305` manifest first and reuse an approved asset before generating anything. It may create or edit only decorative/background/empty-state/support graphics and custom pictograms.

It may run generation or editing only when the active runtime actually exposes that capability. If unavailable, return `ASSET_GENERATION_REQUIRED` with the unresolved gap; do not claim an asset was generated. For every produced revision, record generator/editor capability, provenance, source/reference, prompt or edit intent, dimensions, transparency, format, Drive master destination, optimized derivative destination, and proposed Git production path.

The Asset Producer cannot approve its own work, copy it into production, implement page UI, or issue visual PASS.

## Independent Asset Review

A fresh-context Visual Reviewer compares the produced master and optimized derivative with the canonical FINAL reference and gap record. Review scope includes subject/style fit, crop and composition, edge quality, transparency, dimensions, format, derivative fidelity, prohibited factual content, provenance completeness, and path handoff.

Only an explicit Asset Review `PASS` advances to `ASSET_REVIEW_PASS`. Production application is forbidden before that state. `PRODUCTION_COPY_APPROVED` confirms the reviewed derivative and exact Git path; it does not mean page acceptance.

After `APPLIED`, Playwright recaptures the affected screen/state/viewport. The independent page visual review then compares that capture with the canonical FINAL reference. Release and Notion close are forbidden until every required affected state reaches `PAGE_VISUAL_PASS`.
