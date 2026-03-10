---
name: metrics-query-cookbook
description: Cookbook of ready-to-use PromQL queries, preset catalog, metric name dictionaries, and label references for Ceph storage, network traffic, pod statistics, and MTV migrations. Use when you need specific queries, exact metric names, or label filters.
---

# Metrics Query Cookbook

Ready-to-use queries, preset catalog, and metric name/label references for OpenShift clusters with ODF, OVN-Kubernetes, KubeVirt, and Forklift/MTV.

All examples use the **kubectl-metrics** MCP server tools (`metrics_read` and `metrics_help`).

**Output format guidance**: Use default (`markdown`) when presenting to user. Use `output: "json"` only when you need to parse values programmatically. Use `selector` to filter results by labels post-query.

---

## Preset Catalog

Every preset works as both an instant (default) and range query. Pass `start` to get a time-series trend.

### Cluster & Namespace

| Preset | Description |
|--------|-------------|
| `cluster_cpu_utilization` | Cluster CPU utilization percentage |
| `cluster_memory_utilization` | Cluster memory utilization percentage |
| `cluster_pod_status` | Pod counts by phase (Running, Pending, Failed, Succeeded, Unknown) |
| `cluster_node_readiness` | Node readiness status counts |
| `namespace_cpu_usage` | Top 10 namespaces by CPU usage (cores) |
| `namespace_memory_usage` | Top 10 namespaces by memory usage (bytes) |
| `namespace_network_rx` | Top 10 namespaces by network receive rate |
| `namespace_network_tx` | Top 10 namespaces by network transmit rate |
| `namespace_network_errors` | Network errors + drops by namespace (top 10) |
| `pod_restarts_top10` | Top 10 pods by container restart count |

### Forklift / MTV Migration

| Preset | Description |
|--------|-------------|
| `mtv_migration_status` | Migration counts by status (succeeded/failed/running) |
| `mtv_plan_status` | Plan-level status counts |
| `mtv_migration_duration` | Migration duration per plan (seconds) |
| `mtv_avg_migration_duration` | Average migration duration (seconds) |
| `mtv_data_transferred` | Total bytes migrated per plan |
| `mtv_net_throughput` | Migration network throughput |
| `mtv_storage_throughput` | Migration storage throughput |
| `mtv_migration_pod_rx` | Migration pod receive rate (bytes/sec, top 20) |
| `mtv_migration_pod_tx` | Migration pod transmit rate (bytes/sec, top 20) |
| `mtv_forklift_traffic` | Forklift operator pod network traffic (bytes/sec) |
| `mtv_vmi_migrations_pending` | KubeVirt VMI migrations in pending phase |
| `mtv_vmi_migrations_running` | KubeVirt VMI migrations in running phase |

---

## Storage Metrics (Ceph / ODF)

### Cluster-wide storage health

```json
metrics_read { "command": "query", "flags": { "query": "ceph_health_status", "output": "markdown" } }
```

Result: **0 = OK**, **1 = WARN**, **2 = ERR**.

### Storage capacity

```json
metrics_read { "command": "query", "flags": { "query": "ceph_cluster_total_bytes", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "ceph_cluster_total_used_bytes", "output": "markdown" } }
```

### Pool-level statistics

```json
metrics_read { "command": "query", "flags": { "query": "ceph_pool_percent_used * 100", "output": "markdown" } }
```

### Pool I/O rates

```json
metrics_read { "command": "query", "flags": { "query": "rate(ceph_pool_rd[5m])", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "rate(ceph_pool_wr[5m])", "output": "markdown" } }
```

### OSD operation latency

```json
metrics_read { "command": "query", "flags": { "query": "rate(ceph_osd_op_latency_sum[5m]) / rate(ceph_osd_op_latency_count[5m])", "output": "markdown" } }
```

### Placement group health

```json
metrics_read { "command": "query", "flags": { "query": "ceph_pg_total", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "ceph_pg_degraded", "output": "markdown" } }
```

### Available labels on ceph_* metrics

| Label | Description | Example values |
|-------|-------------|----------------|
| `pool_id` | Ceph pool identifier (pool-level metrics) | `1`, `2`, `3`, `4` |
| `ceph_daemon` | OSD daemon name (OSD-level metrics) | `osd.0`, `osd.1`, `osd.2` |
| `namespace` | Storage operator namespace | `openshift-storage` |
| `managedBy` | Managing resource | `ocs-storagecluster` |
| `job` | Scrape job | `rook-ceph-mgr`, `rook-ceph-exporter` |

### Storage metrics reference

| Metric | Description |
|--------|-------------|
| `ceph_health_status` | Overall cluster health (0=OK, 1=WARN, 2=ERR) |
| `ceph_cluster_total_bytes` | Total cluster capacity |
| `ceph_cluster_total_used_bytes` | Used cluster capacity |
| `ceph_pool_percent_used` | Per-pool usage percentage |
| `ceph_pool_stored` | Bytes stored per pool |
| `ceph_pool_max_avail` | Available bytes per pool |
| `ceph_pool_rd`, `ceph_pool_wr` | Read/write IOPS per pool |
| `ceph_pool_rd_bytes`, `ceph_pool_wr_bytes` | Read/write bytes per pool |
| `ceph_osd_op_latency_sum/count` | OSD operation latency (use as rate ratio) |
| `ceph_pg_total`, `ceph_pg_active`, `ceph_pg_degraded` | Placement group counts |
| `node_filesystem_avail_bytes`, `node_filesystem_size_bytes` | Node filesystem capacity |

---

## Network Traffic Metrics

### Network traffic by namespace

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_network_rx", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_network_tx", "output": "markdown" } }
```

### Network traffic by pod in a namespace

Replace `TARGET_NAMESPACE` with the actual namespace -- **ASK the user** if not known.

```json
metrics_read {
  "command": "query",
  "flags": { "query": "topk(10, sort_desc(sum by (pod)(rate(container_network_receive_bytes_total{namespace=\"TARGET_NAMESPACE\"}[5m]))))", "output": "markdown" }
}
```

```json
metrics_read {
  "command": "query",
  "flags": { "query": "topk(10, sort_desc(sum by (pod)(rate(container_network_transmit_bytes_total{namespace=\"TARGET_NAMESPACE\"}[5m]))))", "output": "markdown" }
}
```

### Network errors and drops by namespace

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_network_errors", "output": "markdown" } }
```

### Node-level network throughput

```json
metrics_read {
  "command": "query",
  "flags": { "query": "instance:node_network_receive_bytes_excluding_lo:rate1m + instance:node_network_transmit_bytes_excluding_lo:rate1m", "output": "markdown" }
}
```

### Available labels on network metrics

| Label | Description | Example values |
|-------|-------------|----------------|
| `namespace` | Pod namespace | `openshift-storage`, `konveyor-forklift` |
| `pod` | Pod name | `forklift-controller-6df77f6bf5-jtt7q` |
| `interface` | Network interface (per-pod metrics) | `eth0` |
| `instance` | Node instance (node-level metrics) | `10.0.0.5:9100` |
| `node` | Node name (node-level metrics) | `worker-0` |

### Network metrics reference

| Metric | Description |
|--------|-------------|
| `container_network_receive_bytes_total` | Bytes received per pod/namespace |
| `container_network_transmit_bytes_total` | Bytes transmitted per pod/namespace |
| `container_network_receive_errors_total` | Receive errors per pod/namespace |
| `container_network_transmit_errors_total` | Transmit errors per pod/namespace |
| `container_network_receive_packets_dropped_total` | Dropped receive packets |
| `container_network_transmit_packets_dropped_total` | Dropped transmit packets |
| `node_network_receive_bytes_total` | Bytes received per node/interface |
| `node_network_transmit_bytes_total` | Bytes transmitted per node/interface |
| `instance:node_network_receive_bytes_excluding_lo:rate1m` | Pre-computed node receive rate |

---

## Pod and Container Statistics

### Pod count by namespace

```json
metrics_read { "command": "query", "flags": { "query": "topk(15, count by (namespace)(kube_pod_info))", "output": "markdown" } }
```

### Pod phase summary

```json
metrics_read { "command": "preset", "flags": { "name": "cluster_pod_status", "output": "markdown" } }
```

### Container CPU usage by namespace

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_cpu_usage", "output": "markdown" } }
```

### Container memory usage by namespace

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_memory_usage", "output": "markdown" } }
```

### Container restart counts (instability indicator)

```json
metrics_read { "command": "preset", "flags": { "name": "pod_restarts_top10", "output": "markdown" } }
```

### Pods with high recent restarts (use `debug_read` for details)

After finding pods with high restarts, use `debug_read` to get pod details and logs:

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<NAMESPACE>", "query": "where status.containerStatuses[0].restartCount > 5", "output": "markdown" } }
```

```json
debug_read { "command": "logs", "flags": { "name": "<POD_NAME>", "namespace": "<NAMESPACE>", "tail": 100, "query": "where level = 'ERROR'", "output": "markdown" } }
```

### Available labels on pod/container metrics

| Label | Description | Example values |
|-------|-------------|----------------|
| `namespace` | Pod namespace | `konveyor-forklift`, `openshift-cnv` |
| `pod` | Pod name | `forklift-controller-6df77f6bf5-jtt7q` |
| `container` | Container name | `main`, `inventory`, `extract` |
| `node` | Node the pod runs on | `worker-0`, `worker-1` |
| `phase` | Pod phase (on status metrics) | `Running`, `Pending`, `Failed`, `Succeeded` |
| `uid` | Pod UID | `793fb1cb-3e58-4eef-b95a-733f237365a3` |
| `created_by_kind` | Owner resource kind (on kube_pod_info) | `ReplicaSet`, `DaemonSet`, `StatefulSet` |
| `created_by_name` | Owner resource name (on kube_pod_info) | `forklift-controller-6df77f6bf5` |
| `host_ip` | Node IP (on kube_pod_info) | `192.168.0.77` |
| `pod_ip` | Pod IP (on kube_pod_info) | `10.129.3.3` |

### Pod/container metrics reference

| Metric | Description |
|--------|-------------|
| `kube_pod_info` | Pod metadata (node, namespace, IPs, owner) |
| `kube_pod_status_phase` | Pod phase (Running/Pending/Failed/Succeeded) |
| `kube_pod_container_status_restarts_total` | Container restart count |
| `kube_pod_container_status_waiting_reason` | Waiting reason (CrashLoopBackOff, ImagePullBackOff, etc.) |
| `container_cpu_usage_seconds_total` | Container CPU usage |
| `container_memory_working_set_bytes` | Container memory usage |
| `namespace:container_cpu_usage:sum` | Pre-aggregated CPU by namespace |
| `namespace:container_memory_usage_bytes:sum` | Pre-aggregated memory by namespace |

---

## Forklift / MTV Migration Metrics

### Available labels on mtv_* metrics

All `mtv_*` metrics share these labels for filtering and grouping:

| Label | Description | Example values |
|-------|-------------|----------------|
| `provider` | Source provider type | `vsphere`, `ovirt`, `openstack`, `ova`, `ec2` |
| `mode` | Migration mode | `Cold`, `Warm` |
| `target` | Target cluster | `Local` (host cluster) or remote cluster name |
| `owner` | User who owns the migration | `admin@example.com` |
| `plan` | Migration plan UUID | `363ce137-dace-4fb4-b815-759c214c9fec` |
| `namespace` | Forklift operator namespace | `konveyor-forklift`, `openshift-mtv` |
| `status` | Migration/plan status (on status metrics) | `Succeeded`, `Failed`, `Executing` |

### MTV migration metrics reference

| Metric | Description |
|--------|-------------|
| `mtv_migrations_status_total` | Migration counts by status (succeeded/failed/running) |
| `mtv_plans_status` | Plan-level status counts |
| `mtv_migration_data_transferred_bytes` | Total bytes migrated per plan |
| `mtv_migration_net_throughput` | Migration network throughput |
| `mtv_migration_storage_throughput` | Migration storage throughput |
| `mtv_migration_duration_seconds` | Migration duration per plan |
| `mtv_plan_alert_status` | Alerts on migration plans |
| `mtv_workload_migrations_status_total` | Per-workload migration status (per plan + status) |
| `kubevirt_vmi_migrations_in_pending_phase` | Live VMI migrations pending |
| `kubevirt_vmi_migrations_in_running_phase` | Live VMI migrations in progress |

### Migration status overview

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_status", "output": "markdown" } }
```

### Migration plan status

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_plan_status", "output": "markdown" } }
```

### Migration data transfer and throughput

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_data_transferred", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_net_throughput", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_storage_throughput", "output": "markdown" } }
```

### Migration duration

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_duration", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_avg_migration_duration", "output": "markdown" } }
```

### Migration alerts

```json
metrics_read { "command": "query", "flags": { "query": "mtv_plan_alert_status", "output": "markdown" } }
```

### Narrowing migration metrics with label filters

Use `{label="value"}` in PromQL or use the `selector` flag:

```json
metrics_read { "command": "query", "flags": { "query": "mtv_migration_data_transferred_bytes", "selector": "provider=vsphere", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "mtv_migration_data_transferred_bytes{mode=\"Cold\"}", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "mtv_migration_data_transferred_bytes{provider=\"ovirt\", mode=\"Warm\"}", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "mtv_migrations_status_total{status=\"Failed\"}", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "mtv_workload_migrations_status_total{plan=\"PLAN_UUID\", status=\"Failed\"}", "output": "markdown" } }
```

### Grouping migration metrics

```json
metrics_read { "command": "query", "flags": { "query": "sum by (provider)(mtv_migration_data_transferred_bytes)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "sum by (mode)(mtv_migration_data_transferred_bytes)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "sum by (provider, mode)(mtv_migration_data_transferred_bytes)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "sum by (status, provider)(mtv_migrations_status_total)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "avg by (provider)(mtv_migration_duration_seconds)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "sum by (plan, status)(mtv_workload_migrations_status_total)", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "sum by (provider, status)(mtv_plans_status)", "output": "markdown" } }
```

### Network traffic of migration pods

During active Forklift migrations, data-transfer pods (virt-v2v, populator, importer) run in the target namespace.

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_pod_rx", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_pod_tx", "output": "markdown" } }
```

Filter to a specific namespace:

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_pod_rx", "namespace": "TARGET_NAMESPACE", "output": "markdown" } }
```

Filter to specific pod patterns:

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_pod_rx", "selector": "pod=~virt-v2v.*", "output": "markdown" } }
```

### Checking migration pod status with `debug_read`

To investigate migration pod issues alongside metrics:

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<NAMESPACE>", "selector": "plan", "output": "markdown" } }
```

```json
debug_read { "command": "logs", "flags": { "name": "<POD_NAME>", "namespace": "<NAMESPACE>", "tail": 100, "query": "where level = 'ERROR'", "output": "markdown" } }
```

### Network traffic of the Forklift operator itself

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_forklift_traffic", "output": "markdown" } }
```

### KubeVirt VMI migration metrics

These track live VM migrations (vMotion-style), not Forklift cold migrations:

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_vmi_migrations_pending", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_vmi_migrations_running", "output": "markdown" } }
```

---

## Quick Health Dashboard

Run key queries for a cluster overview:

```json
metrics_read { "command": "preset", "flags": { "name": "cluster_cpu_utilization", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "cluster_memory_utilization", "output": "markdown" } }
```

```json
metrics_read { "command": "query", "flags": { "query": "ceph_health_status", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "namespace_network_rx", "output": "markdown" } }
```

```json
metrics_read { "command": "preset", "flags": { "name": "mtv_migration_status", "output": "markdown" } }
```
