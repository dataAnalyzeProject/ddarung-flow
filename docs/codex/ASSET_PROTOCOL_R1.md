# Asset Protocol R1

Use the current `TASK-305` baseline manifest before implementing Consumer R2.2 frontend presentation.

## Boundaries

Assets may be decorative illustrations/backgrounds, empty-state artwork, supporting Premium/AI/Ride graphics, or required custom pictograms. Implement buttons, cards, forms, tables, text, and stateful UI as React/CSS.

Never use generated or static images to impersonate factual maps, routes, probabilities, inventory, time, distance, charts, provider results, or text-heavy UI. Do not substitute emoji, placeholders, arbitrary icons, or temporary CSS drawings and then claim visual PASS.

## ASSET_GAP

Every newly discovered required asset creates an `ASSET_GAP` with:

- `screenId`;
- placement;
- reason;
- reference location or crop;
- target width/height or ratio;
- transparency requirement;
- format.

When image generation/editing is actually available, create or edit the asset, record provenance, apply it, recapture in Playwright, and re-review in the same lifecycle. If generation is unavailable, preserve the gap as an external asset-producer gate and do not pass visual acceptance.

Source/master files live in Drive, inventory and approval history in Notion, and only approved optimized production copies in `frontend/src/assets/consumer-r2/**`.
