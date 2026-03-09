---
name: browse-source-vms
category: Migration
description: >
  Browse VMs available for migration from a source provider inventory.
  Supports filtering by name, power state, resource size, or custom TSL query.
tools:
  - mtv_read (server: kubectl-mtv)
skills:
  - inventory-tool-guide
  - inventory-query-cookbook
---

# Browse Source VMs

Goal: show the user which VMs are available for migration from a source provider.

## Inputs

Collect before starting:
- **namespace** -- check session context first; **ASK the user** only if missing.
- **provider** -- resolved in step 1 (do NOT assume which provider to use).
- **filter** -- resolved in step 2.

## Steps

### Step 1 -- List providers and pick one

```json
mtv_read { "command": "get provider", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF only one source provider exists** (type is not openshift): use it automatically
and tell the user which provider you are using.
**IF multiple source providers exist**: list them and **ASK the user** which one to use.
Do NOT pick one for the user.
**IF no source providers exist**: tell the user no source providers are configured.
Suggest running the `create-vsphere-provider` playbook first. Stop here.

### Step 2 -- Determine filtering

Check if the user already specified filter criteria in their original request
(e.g. "show me powered-on VMs", "list VMs named prod-*", "large VMs over 8GB").

**IF the user already specified criteria**: use them directly, skip to step 3.
**IF the user gave no criteria**: show all VMs by default. Do NOT present a menu of
filter options unless the result set is very large (>50 VMs) -- in that case, suggest
the user might want to filter and ask what criteria to use.

### Step 3 -- Fetch VMs

Pick the matching call based on the filter criteria.

**Output format**: Use `"output": "markdown"` for display. Use `"output": "json"` only
if you need to parse results programmatically (e.g. counting, grouping).

**No filter (show all):**

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**Filter by name pattern** (user provided `<PATTERN>`):

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "query": "where name ~= '<PATTERN>'", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**Filter by power state:**

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "query": "where powerState = 'poweredOn'", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**Filter by size** (user provided thresholds):

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "query": "where memoryMB > <MEMORY> and cpuCount > <CPU>", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**Custom TSL query** (user provided `<QUERY>`):

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "query": "<QUERY>", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**For extended details** (disks, NICs, concerns):

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "extended": true, "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF PASS** (results returned): continue to step 4.
**IF empty results**: tell the user no VMs matched. Suggest broadening the filter
or verifying the provider name. Do NOT silently retry with different criteria.
**IF FAIL** (error): check the error:
- **Provider not found**: verify provider name and namespace with the user.
- **Provider not ready**: suggest running `check-mtv-health` first.
- **TSL syntax error**: show the error message and ask the user to rephrase.

### Step 4 -- Report

Present the VM list as a readable table. Include the total VM count.

If there are VMs with critical migration concerns, highlight them:

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "query": "where any(concerns[*].category = 'Critical')", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF critical concerns found**: warn the user which VMs have migration issues and
what the concerns are. These VMs may fail or have problems during migration.

Suggest next steps: "You can create a migration plan for these VMs."
