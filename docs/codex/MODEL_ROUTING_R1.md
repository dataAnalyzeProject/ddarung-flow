# Model Routing R1.1

## Evidence rule

Resolve routing from the current task, then the role default, then the task ceiling. Use only model/effort combinations exposed by the active runtime. Evidence must state requested and actual values; never claim a requested override was applied when it was not.

If a requested route is unavailable, use the closest supported GPT-5.6-family route that does not silently exceed the task ceiling. Record `REQUESTED_MODEL`, `ACTUAL_MODEL`, and `FALLBACK_REASON`. If no compliant route exists, keep responsibility with the orchestrator and record the limitation.

## Role defaults

| Role | Requested route | Escalation |
|---|---|---|
| Orchestrator | Same as the current task implementation tier | one tier for dependency or contract conflict |
| Implementer | Current task difficulty tier | one tier only after the same structural BLOCKER/MAJOR recurs twice after repair |
| Independent Reviewer | Same as, or one tier above, the implementer | a higher tier for security, evidence, exactly-once, or cross-layer findings |
| QA/log triage | GPT-5.6 Terra / medium | GPT-5.6 Sol / medium or high for an unexplained cross-layer failure |
| Asset Producer | GPT-5.6 Sol / medium for gap resolution, provenance, and handoff; use the runtime image tool for actual image output | GPT-5.6 Sol / high for complex separation, transparency, or multi-reference edits; never exceed the current FE task ceiling |
| Visual Reviewer | GPT-5.6 Terra / high or GPT-5.6 Sol / medium | GPT-5.6 Sol / high or xhigh only for Main, Ride, Guide, Journey, Foundation, or cutover |
| Release/Closer | GPT-5.6 Terra / medium | return conflicts or CI root-cause decisions to Sol orchestrator |
| Bulk evidence formatting | GPT-5.6 Luna / medium | return semantic decisions to Terra/Sol |

`max` is never the global default.

Asset Producer routing does not manufacture media capability. Before dispatch, record whether the active runtime exposes image generation or editing. If it does not, return `ASSET_GENERATION_REQUIRED` without claiming `PRODUCED`. Independent Asset Review uses the Visual Reviewer route and the current FE task ceiling.

## Consumer R2.2 task routes and ceilings

| Task | Implement/orchestrate | Reviewer | Ceiling/notes |
|---|---|---|---|
| TASK-290 | Terra high | Sol medium | Sol high; deterministic provider parser/DTO |
| TASK-274 | Sol medium | Sol medium/high | Sol high; new API plus provider mapping |
| TASK-275 | Sol medium | Sol high | xhigh; provider modes plus regression preservation |
| TASK-279 | Sol high | Sol high/xhigh | xhigh; authentication and security boundary |
| TASK-280 | Sol xhigh | Sol xhigh/max | max; AI evidence integrity and fail-closed behavior |
| TASK-281 | Sol high | Sol high/xhigh | xhigh; multi-source AI evidence orchestration |
| TASK-282 | Sol xhigh | Sol xhigh/max | max; unified Journey cross-layer work |
| TASK-283 | Sol medium | Sol high | xhigh; replay and current-evidence semantics |
| TASK-285 | Terra high | Sol medium | Sol high; isolated Flyway migration |
| TASK-287 | Sol xhigh | Sol xhigh/max | max; scheduler, exactly-once, and event semantics |
| TASK-291 | Sol high | Visual Reviewer Sol high/xhigh | xhigh; shared visual foundation |
| TASK-292 | Terra high | Visual Reviewer Sol medium | Sol high for authentication-presentation regression |
| TASK-293 | Sol high | Sol/Visual high/xhigh | max only for a route or state structural conflict |
| TASK-294 | Terra high | Visual Reviewer Sol medium | Sol high; factual presentation states |
| TASK-295 | Sol high | Sol/Visual high/xhigh | xhigh; map, provider, and route state |
| TASK-296 | Sol medium | Visual Reviewer Sol medium/high | Sol high; Premium state UI without policy change |
| TASK-297 | Sol high | Sol/Visual high/xhigh | xhigh; factual and AI partial states |
| TASK-298 | Sol xhigh | Sol/Visual xhigh/max | max; Journey FE cross-state complexity |
| TASK-299 | Terra high | Visual Reviewer Sol medium | Sol high; local persistence and personal UI |
| TASK-300 | Sol high | Sol/Visual high | xhigh; Q&A plus Alerts/recheck states |
| TASK-301 | Sol xhigh | Sol/Visual xhigh/max | max; live route, auth, and API cutover |
| TASK-302 | Terra high | Sol medium | Sol high; cleanup and audit |
| TASK-262 | Sol xhigh | QA Terra high; Visual Sol xhigh | max only for an unresolved final cross-layer blocker |

The current Notion task can narrow these ceilings. A newer approved contract change is required to expand them.

## Escalation rule

- One finding and its first recurrence after repair are not model-escalation reasons. Raise one tier only when the same structural BLOCKER or MAJOR recurs twice after repair.
- Do not raise the model tier for a structural MINOR, or for a syntax or configuration failure with a straightforward cause.
- Use max only within the task ceiling and only when either an xhigh review has not resolved a repeatedly recurring structural BLOCKER/MAJOR, or final integration has an actual cross-layer conflict. Record `MAX_ESCALATION_REASON` whenever max is used.
