---
name: create-migration-target
category: Setup
description: >
  Creates an OpenShift target provider (the local cluster where VMs will
  be migrated to) and verifies it is ready.
tools:
  - mtv_read (server: kubectl-mtv)
  - mtv_write (server: kubectl-mtv)
  - debug_read (server: kubectl-debug-queries)
---

# Create Migration Target (OpenShift Provider)

Goal: register the local OpenShift cluster as a migration target provider and verify it.

In MTV terminology, the "host" provider is the local OpenShift/KubeVirt cluster
where VMs will land after migration. Every migration plan needs a target provider.

## Inputs

Collect before starting:
- **namespace** -- check session context first; **ASK the user** only if missing.
- **provider name** -- **ASK the user**; suggest "host" as default.

Do NOT proceed until both inputs are collected.

## Steps

### Step 1 -- Check existing providers

```json
mtv_read { "command": "get provider", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF an openshift-type provider already exists**: tell the user which one, and ask if they
want to use it or create a new one with a different name. Do NOT create a duplicate silently.
**IF no openshift provider exists**: continue to step 2.

### Step 2 -- Create the provider

```json
mtv_write { "command": "create provider", "flags": { "name": "<NAME>", "type": "openshift", "namespace": "<NAMESPACE>" } }
```

**IF PASS** (return_value=0): continue to step 3.
**IF FAIL**: check the error message:
- **"already exists"**: the name is taken -- **ASK the user** for a different name.
- **Permission / RBAC error**: tell the user they may lack cluster permissions. Suggest
  contacting a cluster admin.
- **Other error**: show the full error to the user.

### Step 3 -- Verify the provider

```json
mtv_read { "command": "get provider", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Check that the new provider appears and its status is Ready.

**IF status is Ready**: report success (step 4).
**IF status is not Ready**: check events for clues:

```json
debug_read { "command": "events", "flags": { "namespace": "<NAMESPACE>", "query": "where type = 'Warning'", "limit": 10, "output": "markdown" } }
```

Report the provider status and any warning events to the user.

### Step 4 -- Report

**IF provider status is Ready**:
> Migration target "<NAME>" created successfully and is ready to use.

**IF provider status is not Ready**:
> Migration target "<NAME>" was created but is not ready yet.
> Check cluster permissions (RBAC) and try again. Review the warning events above.
