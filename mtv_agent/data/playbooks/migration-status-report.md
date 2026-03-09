---
name: migration-status-report
category: Migration
description: >
  Generates a report of all MTV migrations showing succeeded/failed/running
  counts, data transferred, average duration by provider, and any alerts.
tools:
  - metrics_read (server: kubectl-metrics)
  - mtv_read (server: kubectl-mtv)
  - debug_read (server: kubectl-debug-queries)
skills:
  - metrics-tool-guide
  - metrics-query-cookbook
---

# Migration Status Report

Goal: collect migration metrics over a defined time window and present a structured report.
When failures are found, investigate with logs and events.

## Inputs

Collect before starting:
- **timespan** -- how far back to look. Default: **2 weeks** (`14d`).
  Use the default silently. Only **ASK the user** if they explicitly mention wanting a
  different time window. Do NOT proactively ask "what timespan would you like?"

## Steps

### Step 1 -- Get migration status counts (last <TIMESPAN>)

Use `increase()` to count migrations that occurred within the window:

```json
metrics_read { "command": "query", "flags": { "query": "sum by (status)(increase(mtv_migrations_status_total[<TIMESPAN>]))", "output": "markdown" } }
```

Replace `<TIMESPAN>` with the collected value (e.g. `14d`, `7d`, `30d`).
Save the succeeded, failed, and running counts.

**IF query returns no data**: MTV metrics may not be available. Tell the user and try step 2 as fallback.
**IF data returned**: continue to step 2.

### Step 2 -- Get plan-level status

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_plan_status", "output": "markdown" } }
```

Save plan names and their statuses.

**IF no plans found via metrics**: try directly via MTV:

```json
mtv_read { "command": "get plan", "flags": { "all_namespaces": true, "output": "markdown" } }
```

### Step 3 -- Get data transferred (last <TIMESPAN>)

```json
metrics_read { "command": "query", "flags": { "query": "sum by (provider)(increase(mtv_migration_data_transferred_bytes[<TIMESPAN>]))", "output": "markdown" } }
```

Save bytes transferred per provider. Convert to human-readable units (MB/GB/TB).

### Step 4 -- Get average migration duration by provider

```json
metrics_read { "command": "query", "flags": { "query": "avg by (provider)(mtv_migration_duration_seconds)", "output": "markdown" } }
```

Save per-provider average duration. Convert seconds to minutes or hours.

### Step 5 -- Check for migration alerts

```json
metrics_read { "command": "query", "flags": { "query": "mtv_plan_alert_status", "output": "markdown" } }
```

**IF any alerts exist**: save them for the report.

### Step 6 -- Investigate failures (conditional)

Only run this step if step 1 found failed migrations (Failed count > 0).

Get the failed plan details:

```json
mtv_read { "command": "get plan", "flags": { "all_namespaces": true, "output": "json" } }
```

From the JSON output, find plans where the status indicates failure (look for `"Failed"`
in the status fields). Extract each plan's `name` and `namespace`.
Investigate up to 3 failed plans to keep the report focused.

For each failed plan, check error logs (the MTV operator namespace is usually
`openshift-mtv`; if unsure, run `mtv_read health` first to detect it):

```json
mtv_read { "command": "health logs", "flags": { "namespace": "<MTV_NAMESPACE>", "filter_plan": "<PLAN_NAME>", "filter_level": "error", "output": "markdown" } }
```

Check warning events in the plan's namespace:

```json
debug_read { "command": "events", "flags": { "namespace": "<PLAN_NAMESPACE>", "query": "where Type = 'Warning'", "limit": 10, "output": "markdown" } }
```

### Step 7 -- Report

State the time window covered (e.g. "Last 2 weeks").

Present three tables:

**Migration Summary (last <TIMESPAN>)**

| Status    | Count |
|-----------|-------|
| Succeeded | ...   |
| Failed    | ...   |
| Running   | ...   |

**Data Transferred by Provider (last <TIMESPAN>)**

| Provider | Transferred |
|----------|-------------|
| ...      | ...         |

**Average Duration by Provider**

| Provider | Avg Duration |
|----------|--------------|
| ...      | ...          |

**IF there are alerts**: add an "Alerts" section listing each one.

**IF there are failures**: add a "Failed Migrations" section with:
- Plan name and namespace
- Error log excerpts from step 6
- Warning events from step 6
- Suggested remediation:
  - **Provider connectivity**: check provider status and credentials
  - **Disk transfer errors**: check storage capacity and network between source and target
  - **OOMKilled converter pods**: increase memory limits in ForkliftController settings
  - **Timeout errors**: check if the source VMs are very large and consider warm migration

**IF no migrations in the period**: tell the user no migrations were found in the timespan.
