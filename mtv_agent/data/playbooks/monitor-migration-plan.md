---
name: monitor-migration-plan
category: Migration
description: >
  Shows progress of a specific migration plan including per-VM status,
  disk transfer percentage, network/storage throughput, and pod health.
tools:
  - mtv_read (server: kubectl-mtv)
  - metrics_read (server: kubectl-metrics)
  - debug_read (server: kubectl-debug-queries)
skills:
  - metrics-tool-guide
  - metrics-query-cookbook
---

# Monitor Migration Plan

Goal: show progress of a specific migration plan, scoped to its actual time window,
including pod health and logs for stuck or failed VMs.

This playbook is for monitoring a **specific plan**. For a summary of all migrations
across the system, use the `migration-status-report` playbook instead.

## Inputs

Collect before starting:
- **namespace** -- check session context first; **ASK the user** only if missing.
- **plan name** -- resolved in step 1 (do NOT assume which plan to monitor).

## Notes

- The MTV operator namespace is usually `openshift-mtv` (shown as `<MTV_NAMESPACE>` below).
  If unsure, run `mtv_read { "command": "health", "flags": { "all_namespaces": true } }` first
  and note the namespace from the output.

## Steps

### Step 1 -- List migration plans and pick one

```json
mtv_read { "command": "get plan", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF only one plan exists**: use it automatically and tell the user which plan.
**IF multiple plans exist**: list them and **ASK the user** which plan to monitor.
Do NOT pick one for the user.
**IF no plans exist**: tell the user no migration plans were found in this namespace.
Stop here.

### Step 2 -- Determine the migration time window

```json
mtv_read { "command": "describe plan", "flags": { "name": "<PLAN_NAME>", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Look for the migration start and completion timestamps in the output.
- **IF the migration is still running**: use start time to now.
- **IF the migration has completed**: use start time to completion time.

If timestamps are not visible, fall back to JSON:

```json
mtv_read { "command": "get plan", "flags": { "name": "<PLAN_NAME>", "namespace": "<NAMESPACE>", "output": "json" } }
```

Check `.status.migration.started` and `.status.migration.completed` fields.
Save `<START>` and `<END>` as ISO 8601 timestamps (e.g. `2025-06-15T10:00:00Z`).

Example: if `started = "2025-06-15T10:00:00Z"` and the migration is still running,
use `<START> = "2025-06-15T10:00:00Z"` and omit `<END>` (the tool defaults to now).
If `completed = "2025-06-15T12:30:00Z"`, use that as `<END>`.
If you cannot extract timestamps, fall back to `<START> = "-1h"` (relative).

**IF no timestamps found** (plan may not have started yet): note this and use
`"-1h"` as `<START>`. Tell the user the plan may not have started migrating yet.

### Step 3 -- Show VM-level progress

```json
mtv_read { "command": "get plan", "flags": { "name": "<PLAN_NAME>", "vms": true, "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Save the per-VM status (e.g., Running, Completed, Failed).

**IF any VM shows Failed**: note it for investigation in step 7.
**IF all VMs show Succeeded**: skip to step 8 (report success).

### Step 4 -- Show disk transfer progress

```json
mtv_read { "command": "get plan", "flags": { "name": "<PLAN_NAME>", "disk": true, "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Save the disk transfer completion percentage per VM.

### Step 5 -- Check network and storage throughput over migration window

Use range queries scoped to the migration time window:

```json
metrics_read { "command": "query_range", "flags": { "query": "mtv_migration_net_throughput", "start": "<START>", "end": "<END>", "step": "60s", "output": "markdown" } }
```

```json
metrics_read { "command": "query_range", "flags": { "query": "mtv_migration_storage_throughput", "start": "<START>", "end": "<END>", "step": "60s", "output": "markdown" } }
```

Convert bytes/sec to MB/s. Note the peak and average throughput.

**IF queries return no data**: metrics may not be available yet (migration just started)
or MTV metrics are not configured. Note this in the report but continue.

**IF throughput is near zero but migration shows Running**: possible stall --
investigate pods in step 7.

### Step 6 -- Check migration pod network traffic over migration window

```json
metrics_read { "command": "query_range", "flags": { "query": "sum by (pod)(rate(container_network_receive_bytes_total{namespace=\"<NAMESPACE>\"}[5m]))", "start": "<START>", "end": "<END>", "step": "60s", "output": "markdown" } }
```

```json
metrics_read { "command": "query_range", "flags": { "query": "sum by (pod)(rate(container_network_transmit_bytes_total{namespace=\"<NAMESPACE>\"}[5m]))", "start": "<START>", "end": "<END>", "step": "60s", "output": "markdown" } }
```

**IF no data**: metrics may lag behind. Note this but continue.

### Step 7 -- Investigate failed or stuck VMs (conditional)

Only run this step if any VM shows Failed or appears stuck (no progress).

Check migration pods in the target namespace:

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<NAMESPACE>", "query": "where Name ~= '.*virt-v2v.*|.*populator.*|.*importer.*'", "output": "markdown" } }
```

**IF pods are in error state**: get their logs:

```json
debug_read { "command": "logs", "flags": { "name": "<POD_NAME>", "namespace": "<NAMESPACE>", "tail": 100, "query": "where level = 'ERROR'", "output": "markdown" } }
```

Check events for the namespace:

```json
debug_read { "command": "events", "flags": { "namespace": "<NAMESPACE>", "query": "where Type = 'Warning'", "limit": 15, "output": "markdown" } }
```

Check controller logs for the plan:

```json
mtv_read { "command": "health logs", "flags": { "namespace": "<MTV_NAMESPACE>", "filter_plan": "<PLAN_NAME>", "filter_level": "error", "output": "markdown" } }
```

### Step 8 -- Report

Present a summary with:
- Plan name and overall status
- Migration time window (start to end, or start to now)
- Per-VM progress table (name, status, percentage)
- Disk transfer completion percentage
- Network throughput (peak and average RX/TX in MB/s)
- Storage throughput (peak and average in MB/s)
- Estimated time remaining (if still running): use disk transfer percentage from step 4
  and elapsed time. Example: 40% complete after 30 min means ~45 min remaining
  (elapsed * remaining% / completed%). If percentage data is not available, say
  "estimate not available"

**IF all VMs succeeded**: report success, total duration, total data transferred.
**IF some VMs failed**: list the failed VMs with error details from step 7.
Suggest running `troubleshoot-migration` for deeper diagnosis.
**IF migration appears stuck**: report the stall, include pod status and events from step 7.
Suggest possible causes (provider unreachable, disk transfer stalled, converter pod OOM).
