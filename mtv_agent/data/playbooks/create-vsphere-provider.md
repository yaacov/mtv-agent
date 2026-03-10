---
name: create-vsphere-provider
category: Setup
description: >
  Creates a vSphere source provider by collecting vCenter credentials,
  optionally configuring the VDDK image, and verifying connectivity.
tools:
  - mtv_read (server: kubectl-mtv)
  - mtv_write (server: kubectl-mtv)
  - debug_read (server: kubectl-debug-queries)
---

# Create vSphere Provider

Goal: gather credentials, optionally configure VDDK, create the provider, and verify it.

## Inputs

Collect before starting -- **ASK the user** for all of these (do NOT guess or assume):
- **namespace** -- check session context first; ask the user only if missing.
- **provider name** -- ask the user; suggest "vsphere" as default.
- **vCenter URL** -- ask the user (e.g., `https://vcenter.example.com/sdk`).
- **username** -- ask the user (e.g., `admin@vsphere.local`).
- **password** -- ask the user.

Do NOT proceed until all inputs are collected.

## Steps

### Step 1 -- Check existing providers

```json
mtv_read { "command": "get provider", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF a provider with the same name exists**: tell the user and ask if they want to use
the existing one, pick a different name, or delete and recreate.
**IF no conflict**: continue to step 2.

### Step 2 -- Check VDDK image

```json
mtv_read { "command": "settings get", "flags": { "setting": "vddk_image", "namespace": "<NAMESPACE>", "output": "markdown" } }
```

**IF a VDDK image is already configured**: skip to step 4.
**IF not set**: continue to step 3.

### Step 3 -- Optionally set VDDK image

**ASK the user**:
> No global VDDK image is configured. vSphere migrations require it.
> Should I set it? If yes, provide the image URL (e.g., quay.io/kubev2v/vddk:latest).

**IF the user provides an image** then set it:

```json
mtv_write { "command": "settings set", "flags": { "setting": "vddk_image", "value": "<VDDK_IMAGE>", "namespace": "<NAMESPACE>" } }
```

**IF the setting succeeds** (return_value=0): continue to step 4.
**IF the setting fails**: report the error to the user. They may lack permissions --
suggest contacting an admin or using `--vddk-init-image` on the provider as a fallback.

**IF the user declines**: warn that vSphere migrations may fail without VDDK. Continue to step 4.

### Step 4 -- Create the provider

```json
mtv_write {
  "command": "create provider",
  "flags": {
    "name": "<NAME>",
    "type": "vsphere",
    "url": "<VCENTER_URL>",
    "username": "<USERNAME>",
    "password": "<PASSWORD>",
    "namespace": "<NAMESPACE>"
  }
}
```

**IF PASS** (return_value=0): continue to step 5.
**IF FAIL**: check the error message:
- **"already exists"**: the provider name is taken -- ask user for a different name or delete first.
- **"connection refused" / "tls" / "certificate"**: suggest adding `provider_insecure_skip_tls: true`
  flag, but **ASK the user** for confirmation before retrying with TLS skip.
- **"unauthorized" / "401"**: credentials are wrong -- ask user to re-enter username/password.
- **Other error**: show the full error message and suggest the user check vCenter URL and network.

### Step 5 -- Verify the provider

```json
mtv_read { "command": "get provider", "flags": { "namespace": "<NAMESPACE>", "output": "markdown" } }
```

Check that the new provider appears and its status.

**IF status is Ready**: continue to step 6 (report success).
**IF status is not Ready**: investigate further:

```json
debug_read { "command": "events", "flags": { "namespace": "<NAMESPACE>", "query": "where type = 'Warning'", "limit": 10, "output": "markdown" } }
```

Report the provider status and any warning events to the user.

### Step 6 -- Report

**IF provider status is Ready**:
> Provider "<NAME>" created successfully and is ready to use.
> You can now browse VMs with the `browse-source-vms` playbook.

**IF provider status is not Ready**:
> Provider "<NAME>" was created but is not ready yet.
> Possible causes: vCenter unreachable, invalid credentials, TLS certificate issues.
> Check the events above for details.
