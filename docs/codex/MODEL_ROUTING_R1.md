# Model Routing R1

## Evidence rule

Resolve routing from the current task, then the role default, then the task ceiling. Use only model/effort combinations exposed by the active runtime. Evidence must state requested and actual values; never claim a requested override was applied when it was not.

If a requested route is unavailable, use the closest supported GPT-5.6-family route that does not silently exceed the task ceiling. Record `REQUESTED_MODEL`, `ACTUAL_MODEL`, and `FALLBACK_REASON`. If no compliant route exists, keep responsibility with the orchestrator and record the limitation.

## Role defaults

| Role | Requested route | Escalation |
|---|---|---|
| Orchestrator | GPT-5.6 Sol / high | cross-layer conflict or two repeated findings: xhigh, then task ceiling |
| P0 or complex implementer | GPT-5.6 Sol / high | xhigh/max only for structural difficulty within ceiling |
| Simple cleanup/docs implementer | GPT-5.6 Terra / high | Sol high for ambiguity or failed review |
| Independent Reviewer | GPT-5.6 Sol / xhigh | max for critical P0 or repeated structural finding |
| QA/log triage | GPT-5.6 Terra / medium | Sol high for unexplained cross-layer failure |
| Visual Reviewer | GPT-5.6 Sol / xhigh | max for foundation, Main, Journey, or cutover where allowed |
| Release/Closer | GPT-5.6 Terra / medium | return conflicts or CI root-cause decisions to Sol orchestrator |
| Bulk evidence formatting | GPT-5.6 Luna / medium | return semantic decisions to Terra/Sol |

`max` is never the global default.

## Consumer R2.2 task routes and ceilings

| Task | Implement/orchestrate | Reviewer | Ceiling/notes |
|---|---|---|---|
| TASK-273 | Sol high | Sol xhigh | max |
| TASK-290 | Sol high | Sol xhigh | max |
| TASK-274 | Sol high | Sol xhigh | xhigh |
| TASK-275 | Sol high | Sol xhigh | max |
| TASK-279 | Sol high | Sol xhigh | max for auth/security finding |
| TASK-280 | Sol xhigh | Sol max | reviewer max |
| TASK-281 | Sol high | Sol xhigh | max |
| TASK-282 | Sol high | Sol xhigh | Sol max allowed for complex cross-layer Journey |
| TASK-283 | Sol high | Sol xhigh | xhigh |
| TASK-285 | Sol high | Sol xhigh | max for migration/idempotency finding |
| TASK-287 | Sol xhigh | Sol max | reviewer max; scheduler/exactly-once semantics |
| TASK-291 | Sol xhigh | Visual Reviewer Sol max | visual foundation |
| TASK-292 | Sol high | Visual Reviewer Sol xhigh | xhigh |
| TASK-293 | Sol high | Sol/Visual xhigh | Sol max allowed |
| TASK-294 | Sol high | Visual Reviewer Sol xhigh | xhigh |
| TASK-295 | Sol xhigh | Sol/Visual xhigh | max for map/route conflict |
| TASK-296 | Sol high | Visual Reviewer Sol xhigh | xhigh |
| TASK-297 | Sol xhigh | Sol/Visual xhigh | xhigh |
| TASK-298 | Sol high | Sol/Visual xhigh | Sol max allowed |
| TASK-299 | Sol high | Visual Reviewer Sol xhigh | xhigh |
| TASK-300 | Sol xhigh | Sol/Visual xhigh | xhigh |
| TASK-301 | Sol high | Sol/Visual xhigh | Sol max allowed for cutover |
| TASK-302 | Terra high | Sol high | xhigh |
| TASK-262 | Sol max orchestrator | QA Terra high; Visual Sol xhigh/max | final acceptance only |

The current Notion task can narrow these ceilings. A newer approved contract change is required to expand them.
