# SERVICE-RETIRE-01 Draft Runbook

Status: readiness document only. **Do not execute under TASK-395.**

Actual OCI stop/disable actions require a separately approved
`SERVICE-RETIRE-01 | OCI 런타임 중지 · 보존 검증` task. Permanent deletion
requires an additional explicit confirmation.

## 1. Entry gate

Before any runtime action:

1. Re-read the approved SERVICE-RETIRE-01 contract and exact allowlist.
2. Re-fetch GitHub main SHA, deployment state, running OCI resources, schedules,
   billing view, and public archive links.
3. Confirm the static demo, YouTube video, GitHub, Personal Portfolio, and Public
   Notion all load without authentication.
4. Record the final live runtime state separately from browser acceptance.
5. Stop if the runtime inventory or backup destination is unknown.

## 2. Preserve before stop

- Export an encrypted PostgreSQL logical backup to an approved private location;
  record database name, timestamp, checksum, and restore-test result. Never place
  the dump or credentials in this branch.
- Inventory the OCI Object Storage bucket referenced by deployment configuration
  (`ddarung-flow-bucket` at the current main baseline). Preserve required
  Raw/Quality/Curated data, model artifacts, pointers, manifests, lineage, and
  checksums. Verify representative remote read-back before proceeding.
- Record deployed image digests and exact source SHA for frontend, backend,
  inference, inventory-refresher, and Airflow.
- Preserve non-secret configuration names and environment topology. Do not copy
  secret values, tokens, OAuth credentials, or private keys.
- Capture representative live screenshots and the final runtime evidence record.

## 3. Prevent unintended restart

Current `Staging CD` runs after successful `CI` on `main` and can run `docker
compose up`. Before stopping OCI, an approved follow-up must make automatic
reactivation impossible—for example, disable the Staging CD workflow or change
it to an explicitly confirmed manual-only path. This is a GitHub deployment
semantics change and is **not authorized by TASK-395**.

Also verify and pause or disable, under the follow-up contract:

- Airflow DAG schedules and backfill triggers
- Airflow scheduler and DAG processor
- inventory-refresher or other recurring collectors
- host-level timers/cron and container restart policies
- external uptime monitors or callbacks that trigger recovery

Record each control's previous value so it can be restored.

## 4. Reversible stop order

Execute only after the gates above pass:

1. Stop new writes: inventory-refresher and scheduled collectors.
2. Pause DAGs, then stop Airflow scheduler and DAG processor; wait for or
   explicitly resolve active runs.
3. Stop Airflow API/UI services after metadata is preserved.
4. Stop public frontend/backend traffic, then inference services.
5. Stop application PostgreSQL last, after final backup and connection drain.
6. Stop the OCI Compute instance rather than terminate it.
7. Leave Object Storage, backups, image registry artifacts, secrets, network,
   and environment definitions intact unless a later deletion contract names
   them explicitly.

After each step, record actual state, timestamp, operator, and observed result.

## 5. Post-stop verification

- Static demo and all evidence links remain accessible.
- OCI Compute state is stopped, not terminated.
- No scheduler, collector, or GitHub workflow can restart workloads.
- Object Storage objects and backup checksums remain readable.
- No deletion, secret rotation, repository archival, or evidence removal occurred.
- Billing view is captured after provider metrics have had time to settle.

## 6. Temporary reactivation / rollback

1. Reconfirm authority and the exact image/source SHA to restore.
2. Start Compute and PostgreSQL; verify storage mounts and DB health.
3. Start inference and backend, then frontend; verify same-SHA runtime health.
4. Re-enable inventory collection and Airflow only if fresh writes are intended.
5. Re-enable Staging CD only after the service is meant to accept deployments.
6. Run runtime checks and authenticated browser acceptance as separate gates.

Rollback success is not inferred from containers being present: record database,
inference, backend, frontend, scheduler, and browser results separately.

## 7. Cost and deletion boundary

- Expected direction after Compute stop: compute-related running cost should
  decrease; exact savings remain `UNAVAILABLE` until verified in OCI billing.
- Likely residual costs: boot/block volumes, Object Storage, backups, registry
  artifacts, reserved networking/IP resources, and retained databases if any.
- Stop is reversible. Terminate/delete is destructive.
- Never delete Compute, volumes, databases, Object Storage objects, secrets,
  environments, images, or GitHub evidence under this runbook without a new,
  explicit target list and confirmation.
