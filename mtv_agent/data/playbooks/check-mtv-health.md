---
name: check-mtv-health
category: Health
description: >
  Checks the MTV/Forklift operator health across all namespaces,
  inspects forklift pods and events, and collects error logs if
  any components are unhealthy.
tools:
  - mtv_read (server: kubectl-mtv)
  - debug_read (server: kubectl-debug-queries)
---

# Check MTV Operator Health

Goal: run the MTV health check, inspect pods and events, report status;
collect error logs and pod details if problems are found.

## Inputs

No user input required -- this playbook auto-detects everything.

## Steps

### Step 1 -- Run MTV health check

```json
mtv_read { "command": "health", "flags": { "all_namespaces": true, "output": "markdown" } }
```

The output lists MTV components and their status (operator version, pods, providers, plans).
Note the **operator namespace** from the output (typically `openshift-mtv` but can vary).
Save it as `<MTV_NAMESPACE>` for use in later steps.

**IF PASS** (all components healthy or minor warnings): skip to step 5 (Report).
**IF FAIL** (any component shows errors): continue to step 2.

### Step 2 -- Inspect forklift pods

Use the namespace detected in step 1:

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<MTV_NAMESPACE>", "query": "where status.phase != 'Running' and status.phase != 'Succeeded'", "output": "markdown" } }
```

If the above returns no results (all pods are Running), also check for high-restart pods:

```json
debug_read { "command": "list", "flags": { "resource": "pods", "namespace": "<MTV_NAMESPACE>", "query": "where status.containerStatuses[0].restartCount > 3", "output": "markdown" } }
```

**IF unhealthy pods found**: collect their logs (step 2a).
**IF all pods look healthy**: skip to step 3.

#### Step 2a -- Collect pod logs for unhealthy pods

For each unhealthy pod found, get recent error logs:

```json
debug_read { "command": "logs", "flags": { "name": "<POD_NAME>", "namespace": "<MTV_NAMESPACE>", "tail": 100, "query": "where level = 'ERROR'", "output": "markdown" } }
```

For pods in CrashLoopBackOff, check the previous container's logs:

```json
debug_read { "command": "logs", "flags": { "name": "<POD_NAME>", "namespace": "<MTV_NAMESPACE>", "previous": true, "tail": 100, "output": "markdown" } }
```

### Step 3 -- Check warning events

```json
debug_read { "command": "events", "flags": { "namespace": "<MTV_NAMESPACE>", "query": "where type = 'Warning'", "limit": 20, "output": "markdown" } }
```

**IF warning events found**: save them for the report.
**IF no warning events**: note that events are clean.

### Step 4 -- Collect controller error logs (if health check found issues)

Only run this if step 1 found errors:

```json
mtv_read { "command": "health logs", "flags": { "namespace": "<MTV_NAMESPACE>", "filter_level": "error", "output": "markdown" } }
```

Save the error messages for the report.

### Step 5 -- Report

**IF everything is healthy** then tell the user:
> MTV operator is healthy. All components are running normally.

Include: operator version, number of pods running, provider count, plan count.

**IF issues were found** then present:
- Overall health status from step 1
- List each unhealthy pod with its status and restart count
- Relevant error log lines from step 2a and/or step 4
- Warning events from step 3
- Suggest next steps based on the failure type:
  - **CrashLoopBackOff**: check pod logs for root cause, consider restarting the deployment
  - **ImagePullBackOff**: check image registry access and image name
  - **Provider not ready**: check provider credentials and network connectivity
  - **OOMKilled**: check resource limits in the ForkliftController CR
  - **General errors in logs**: suggest checking the forklift-controller main and inventory containers
