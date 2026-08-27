<!--
Sync Impact Report
- Version change: template → 1.0.0
- Modified principles: none; initial project principles established
- Added sections: Ownership Boundaries; Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->

# Ddarung Flow Constitution

## Core Principles

### I. Source Ownership Is Explicit

Notion MUST remain the source of truth for task scope, assignee, schedule, status, and
leader approval. GitHub PRs and CI MUST remain the source of truth for code review,
exact commit SHA, and automated checks. Spec Kit artifacts MUST describe a change and
its traceability; they MUST NOT overwrite or reinterpret either source.

### II. Specification Before Implementation

Every new feature or explicitly migrated change MUST have a feature specification before
implementation. Material ambiguity in scope, security, data, API behavior, ownership, or
acceptance criteria MUST be resolved in the specification or marked as a blocking
clarification. Existing features MUST NOT be retroactively documented in bulk merely to
claim Spec Kit coverage.

### III. Traceable, Testable Change Scope

Each implemented requirement MUST map to planned tasks and proportionate verification.
The plan MUST identify exact affected paths, non-goals, compatibility boundaries, and
required evidence. Tests, builds, fixture results, and direct runtime observations MUST
be labelled by what they actually prove; fixture success MUST NOT be represented as live
integration proof.

### IV. Harness Gates Remain Binding

The local harness MUST continue to enforce approved work orders, week and dependency
gates, allowed and forbidden paths, secret protection, direct execution evidence, and
Go/No-Go decisions. A passing Spec Kit analysis is necessary documentation evidence when
declared by a work order, but it is never sufficient to mark a task complete.

### V. Minimal, Reversible Adoption

Changes MUST be limited to the requested feature or governance integration. New workflow
rules MUST apply first to new or explicitly migrated work orders, preserving completed
and in-progress work as historical records. No application API, data policy, security
setting, KPI, deployment behavior, or PR merge rule may change as a side effect of Spec
Kit adoption.

## Ownership Boundaries

Spec Kit owns `specs/<feature>/` feature artifacts and the project constitution under
`.specify/`. The work order declares which Spec Kit artifacts are required for a task and
records their paths and verification result. Notion owns collaboration state and approvals;
GitHub owns source changes, PR review, CI, and remote commit identity; the harness owns
cross-source gate evaluation and local evidence. Secrets, tokens, cookies, raw provider
responses, environment values, and personal data MUST NOT appear in any Spec Kit artifact.

## Development Workflow and Quality Gates

For each covered feature, use `$speckit-specify`, `$speckit-clarify` when material
ambiguity remains, `$speckit-plan`, `$speckit-tasks`, and `$speckit-analyze` before
`$speckit-implement`. The task contract determines whether a checklist or convergence
pass is required. Before review, the exact PR HEAD, allowed-file diff, required checks,
and direct runtime evidence MUST be evaluated again. A new or rebased PR head invalidates
earlier verification evidence.

## Governance

This constitution governs Spec Kit artifacts only and complements the current project
rules in `AGENTS.md`, Notion, and `.local-harness`; it does not supersede their source
ownership or approval requirements. Amendments require a recorded change request with
the requesting authority, affected artifacts, migration scope, and regression review.
Use semantic versioning: MAJOR for incompatible principle removal or redefinition, MINOR
for a new or materially expanded principle, and PATCH for non-semantic clarification.
Every Spec Kit-covered PR MUST check constitution compliance, work-order linkage, and
the applicable harness gates.

**Version**: 1.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
