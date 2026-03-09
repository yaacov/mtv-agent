---
name: check-cluster-health
category: Health
description: >
  Checks Ceph storage health, storage capacity, per-node memory usage,
  pod restart counts, and problem pods. Reports a summary table with
  status for each.
tools:
  - metrics_read (server: kubectl-metrics)
  - debug_read (server: kubectl-debug-queries)
skills:
  - metrics-tool-guide
  - metrics-query-cookbook
---

# Check Cluster Health

Goal: query health indicators via metrics and Kubernetes resources, present a summary table.

## Inputs

Collect before starting:
- **timespan** -- how far back to look for pod restarts. Default: **24 hours** (`24h`).
  Use the default silently. Only **ASK the user** if they explicitly mention wanting a
  different time window. Do NOT proactively ask "what timespan would you like?"

## Steps

### Step 1 -- Check Ceph storage health

```json
metrics_read { "command": "query", "flags": { "query": "ceph_health_status", "output": "markdown" } }
```

Read the value: **0 = OK**, **1 = WARN**, **2 = ERR**.

**IF value is 0**: save status as OK.
**IF value is 1**: save status as WARN, note Ceph is degraded but functional.
**IF value is 2**: save status as ERR, note Ceph has critical issues.
**IF query returns no data**: save status as N/A (Ceph/ODF may not be installed).

### Step 2 -- Check storage capacity

Query used, total, and percentage:

```json
metrics_read { "command": "query", "flags": { "query": "ceph_cluster_total_used_bytes", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "ceph_cluster_total_bytes", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "ceph_cluster_total_used_bytes / ceph_cluster_total_bytes * 100", "output": "markdown" } }
```

Convert bytes to human-readable units (GB/TB). Save the used, total, and percentage
values -- these are what you will report in the summary table.

**IF percentage > 80**: mark status as WARN (approaching full threshold of 85%).
**IF percentage > 85**: mark status as ERR (at or above full threshold).
**IF queries return no data**: mark as N/A.

### Step 3 -- Check node status

```json
debug_read { "command": "list", "flags": { "resource": "nodes", "output": "markdown" } }
```

**IF any node is NotReady**: mark status as ERR, list the affected nodes.
**IF all nodes are Ready**: mark status as OK.

### Step 4 -- Check memory usage per node

Query raw values and percentage:

```json
metrics_read { "command": "query", "flags": { "query": "node_memory_MemTotal_bytes", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "node_memory_MemAvailable_bytes", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100", "output": "markdown" } }
```

Convert bytes to human-readable units (GB).
Each result row is one node. Save total, available, and used percentage per node.

**IF any node is above 90%**: mark status as WARN.
**IF all nodes below 90%**: mark status as OK.

### Step 5 -- Check pod restarts (last <TIMESPAN>)

Use `increase()` over the chosen timespan for recent restarts only:

```json
metrics_read { "command": "query", "flags": { "query": "topk(5, sort_desc(increase(kube_pod_container_status_restarts_total[<TIMESPAN>])))", "output": "markdown" } }
```

Replace `<TIMESPAN>` with the collected value (e.g. `24h`, `7d`).

**IF any pod has more than 10 restarts**: mark status as WARN.
**IF all pods below 10 restarts**: mark status as OK.

### Step 6 -- Check for problem pods

```json
debug_read { "command": "list", "flags": { "resource": "pods", "all_namespaces": true, "query": "where Status != 'Running' and Status != 'Succeeded' and Status != 'Completed'", "limit": 15, "output": "markdown" } }
```

**IF problem pods found**: save them for the report.
**IF no problem pods**: note cluster pods are healthy.

### Step 7 -- Check warning events cluster-wide

```json
debug_read { "command": "events", "flags": { "all_namespaces": true, "query": "where Type = 'Warning'", "limit": 15, "output": "markdown" } }
```

**IF warning events found**: save the most recent ones for the report.

### Step 8 -- Report

Present a summary table:

| Check         | Status      | Detail                                           |
|---------------|-------------|--------------------------------------------------|
| Ceph health   | OK/WARN/ERR/N/A | value from step 1                            |
| Storage usage | OK/WARN/ERR/N/A | used / total (e.g. 1.2 TB / 4.0 TB, 30%)    |
| Nodes         | OK/ERR      | count of Ready vs total nodes from step 3        |
| Memory usage  | OK/WARN     | worst node used / total (e.g. 28 GB / 32 GB, 88%) |
| Pod stability | OK/WARN     | top restarter from step 5 (last <TIMESPAN>)      |
| Problem pods  | OK/WARN     | count and names from step 6                      |

**IF there are multiple nodes** then also show a per-node memory breakdown:

| Node     | Used    | Total   | Usage % |
|----------|---------|---------|---------|
| worker-0 | ...     | ...     | ...     |
| worker-1 | ...     | ...     | ...     |

**IF warning events were found** then add a "Recent Warnings" section listing the top events.

**IF all checks pass**: Tell the user the cluster is healthy.
**IF any check is WARN/ERR**: Highlight the issues and suggest remediation:
- **Ceph ERR/WARN**: Check storage pods, run `check-mtv-health` playbook, see metrics-query-cookbook for Ceph queries
- **Storage > 80%**: Clean up unused PVCs, Released PVs, or expand capacity
- **Nodes NotReady**: Check node conditions and kubelet status
- **Memory > 90%**: Identify heavy consumers, consider scaling the cluster
- **High restarts**: Investigate the crashing pods with debug_read logs
- **Problem pods**: Investigate with debug_read logs and events
