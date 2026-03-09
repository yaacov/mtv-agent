---
name: show-migration-network-traffic
category: Migration
description: >
  Shows per-pod inbound (RX) and outbound (TX) network transfer rates
  during VM migration, plus any network errors or drops.
tools:
  - metrics_read (server: kubectl-metrics)
  - mtv_read (server: kubectl-mtv)
  - debug_read (server: kubectl-debug-queries)
skills:
  - metrics-tool-guide
  - metrics-query-cookbook
---

# Show Migration Network Traffic

Goal: show how much network bandwidth each migration pod is using,
detect errors, and present RX/TX tables.

This playbook focuses on **network traffic of migration pods** (virt-v2v, populator,
importer). For overall migration progress, use `monitor-migration-plan` instead.

## Inputs

Collect before starting:
- **namespace** -- check session context first; **ASK the user** only if missing.
  Suggest common values: `openshift-mtv`, `konveyor-forklift`.
- **migration plan** (optional) -- if the user mentions a specific migration or plan,
  **ASK for the plan name** so we can scope the time window. If the user just wants
  current traffic, no plan name is needed.

## Steps

### Step 1 -- Determine time window

**IF a specific migration plan was provided**:

```json
mtv_read { "command": "describe plan", "flags": { "name": "<PLAN_NAME>", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Look for start and completion timestamps. If not visible, fall back to:

```json
mtv_read { "command": "get plan", "flags": { "name": "<PLAN_NAME>", "namespace": "<NAMESPACE>", "output": "json" } }
```

Check `.status.migration.started` and `.status.migration.completed` fields.
Compute the migration duration and round up to the nearest Prometheus duration unit.
Save this as `<RATE_WINDOW>`.

Example: if `started = "2025-06-15T10:00:00Z"` and `completed = "2025-06-15T12:30:00Z"`,
the duration is 2.5 hours -- use `[3h]`. If 45 minutes, use `[1h]`.
If the migration is still running, use the time elapsed since start, rounded up.
If you cannot determine timestamps, fall back to `[1h]` as a safe default.

**IF FAIL** (plan not found): tell the user the plan was not found and **ASK** them
to verify the name and namespace. Stop here until clarified.

**IF no specific migration was given**: use a default rate window of `[1h]`.

### Step 2 -- Get inbound (RX) traffic by pod

```json
metrics_read { "command": "query", "flags": { "query": "topk(10, sort_desc(sum by (pod)(rate(container_network_receive_bytes_total{namespace=\"<NAMESPACE>\"}[<RATE_WINDOW>]))))", "output": "markdown" } }
```

**IF data returned**: save the per-pod RX rates.
**IF no data**: no network traffic found. Possible causes:
- No pods running in the namespace
- Metrics not being collected
- Migration has not started yet

Note this and continue to step 3 (TX may still have data).

### Step 3 -- Get outbound (TX) traffic by pod

```json
metrics_read { "command": "query", "flags": { "query": "topk(10, sort_desc(sum by (pod)(rate(container_network_transmit_bytes_total{namespace=\"<NAMESPACE>\"}[<RATE_WINDOW>]))))", "output": "markdown" } }
```

**IF data returned**: save the per-pod TX rates.
**IF no data**: note as above.

### Step 4 -- Check for network errors and drops

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_network_errors", "output": "markdown" } }
```

**IF errors or drops found**: save them and flag the affected namespace/pod.
**IF no errors**: note that the network is clean.

### Step 5 -- Check migration pod health (conditional)

Run this step only if steps 2-3 returned no traffic data or show zero traffic
for pods that should be active.

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<NAMESPACE>", "query": "where Name ~= '.*virt-v2v.*|.*populator.*|.*importer.*'", "output": "markdown" } }
```

**IF pods are in error/pending state**: get their events:

```json
debug_read { "command": "events", "flags": { "namespace": "<NAMESPACE>", "query": "where Type = 'Warning'", "limit": 10, "output": "markdown" } }
```

**IF no migration pods found at all**: tell the user there are no active migration pods
in this namespace. The migration may have completed or not started.

### Step 6 -- Report

State the time window used (e.g. "Rate over last 1 hour" or
"Rate over migration window: 14:00-16:30 UTC").

Convert all byte rates to human-readable units (KB/s, MB/s, GB/s).

Present two tables:

**Inbound Traffic (RX)**

| Pod | Rate |
|-----|------|
| ... | ...  |

**Outbound Traffic (TX)**

| Pod | Rate |
|-----|------|
| ... | ...  |

**IF network errors or drops were found (step 4)**: add a "Network Warnings" section
listing the affected pods and error counts.

**IF migration pods are unhealthy (step 5)**: add a "Pod Issues" section listing
the pod statuses and events, with suggested remediation.

**IF no traffic at all and no migration pods**: tell the user no migration activity
was detected in this namespace. Suggest verifying the namespace and that a migration
is actually running.
