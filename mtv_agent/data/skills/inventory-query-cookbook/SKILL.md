---
name: inventory-query-cookbook
description: Field references for all MTV inventory resource types and ready-to-use TSL queries. Use when you need exact field names for inventory queries.
---

# Inventory Query Cookbook

Field references and query examples for MTV inventory.

Replace `<PROVIDER>` and `<NS>` with actual values. Always set `namespace`. To discover fields not listed here, query any resource with `"output": "json"` and `"query": "limit 1"` and inspect the returned object.

---

## vSphere VM Fields

### Identity and State

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"my-vm"` |
| `id` | string | `"vm-147"` |
| `uuid` | string | `"423ed598-..."` |
| `path` | string | `"/Datacenter/vm/my-vm"` |
| `parent.id` | string | `"group-v4"` |
| `parent.kind` | string | `"Folder"` |
| `powerState` | string | `"poweredOn"`, `"poweredOff"` |
| `powerStateHuman` | string | `"On"`, `"Off"` |
| `connectionState` | string | `"connected"` |

### Compute

| Field | Type | Example |
|-------|------|---------|
| `cpuCount` | number | `2` |
| `coresPerSocket` | number | `2` |
| `memoryMB` | number | `4096` |
| `memoryGB` | string | `"4.0 GB"` |
| `balloonedMemory` | number | `0` |
| `cpuHotAddEnabled` | bool | `false` |
| `cpuHotRemoveEnabled` | bool | `false` |
| `memoryHotAddEnabled` | bool | `false` |

### Guest and Firmware

| Field | Type | Example |
|-------|------|---------|
| `guestId` | string | `"rhel8_64Guest"` |
| `guestName` | string | `"Red Hat Enterprise Linux 8 (64-bit)"` |
| `firmware` | string | `"efi"`, `"bios"` |
| `isTemplate` | bool | `false` |
| `ipAddress` | string | `"10.0.0.5"` |
| `hostName` | string | `"myhost.example.com"` |
| `host` | string | `"host-10"` |

### Storage and Security

| Field | Type | Example |
|-------|------|---------|
| `storageUsed` | number | `15762181155` (bytes) |
| `storageUsedGB` | string | `"14.7 GB"` |
| `diskCapacity` | string | `"16.0 GB"` |
| `diskEnableUuid` | bool | `true` |
| `secureBoot` | bool | `true` |
| `tpmEnabled` | bool | `false` |
| `changeTrackingEnabled` | bool | `true` |

### VMware Tools and Snapshot

| Field | Type | Example |
|-------|------|---------|
| `toolsRunningStatus` | string | `"guestToolsRunning"`, `"guestToolsNotRunning"` |
| `toolsStatus` | string | `"toolsOk"`, `"toolsNotRunning"` |
| `toolsVersionStatus2` | string | `"guestToolsCurrent"`, `"guestToolsUnmanaged"` |
| `snapshot.id` | string | `""`, `"snapshot-2355"` |
| `snapshot.kind` | string | `""`, `"VirtualMachineSnapshot"` |
| `faultToleranceEnabled` | bool | `false` |

### Concerns (computed)

| Field | Type | Example |
|-------|------|---------|
| `criticalConcerns` | number | `0` |
| `warningConcerns` | number | `2` |
| `infoConcerns` | number | `1` |
| `concernsHuman` | string | `"0/2/1"` (critical/warning/info) |
| `concerns[*].category` | string | `"Critical"`, `"Warning"`, `"Information"` |
| `concerns[*].label` | string | `"VM snapshot detected"` |
| `concerns[*].assessment` | string | description text |
| `concerns[*].id` | string | `"vmware.snapshot.detected"` |

### Disks (`disks[*]`)

| Field | Type | Example |
|-------|------|---------|
| `disks[*].capacity` | number | `17179869184` (bytes) |
| `disks[*].bus` | string | `"scsi"`, `"nvme"` |
| `disks[*].mode` | string | `"persistent"` |
| `disks[*].file` | string | `"[datastore] vm/vm.vmdk"` |
| `disks[*].shared` | bool | `false` |
| `disks[*].rdm` | bool | `false` |
| `disks[*].serial` | string | `"6000C29d-..."` |
| `disks[*].datastore.id` | string | `"datastore-16"` |
| `disks[*].datastore.kind` | string | `"Datastore"` |
| `disks[*].controllerKey` | number | `1000` |
| `disks[*].unitNumber` | number | `0` |
| `disks[*].parent` | string | `""` or base disk path (snapshots) |

### NICs (`nics[*]`)

| Field | Type | Example |
|-------|------|---------|
| `nics[*].mac` | string | `"00:50:56:be:9c:85"` |
| `nics[*].network.id` | string | `"network-20"` |
| `nics[*].network.kind` | string | `"Network"` |
| `nics[*].deviceKey` | number | `4000` |
| `nics[*].order` | number | `0` |

### Networks and Devices

| Field | Type | Example |
|-------|------|---------|
| `networks[*].id` | string | `"network-20"` |
| `networks[*].kind` | string | `"Network"` |
| `devices[*].kind` | string | `"VirtualE1000e"`, `"VirtualVmxnet3"` |

---

## vSphere Network Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"VM Network"` |
| `id` | string | `"network-21"` |
| `path` | string | `"/Datacenter/network/VM Network"` |
| `variant` | string | `"Standard"` |
| `vlanId` | string | `""` |
| `hostCount` | number | `0` |

---

## vSphere Datastore Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"datastore1"` |
| `id` | string | `"datastore-14"` |
| `path` | string | `"/Datacenter/datastore/datastore1"` |
| `type` | string | `"VMFS"`, `"NFS"`, `"NFS41"` |
| `capacity` | number | `101737037824` (bytes) |
| `capacityHuman` | string | `"94.8 GB"` |
| `free` | number | `2010120192` (bytes) |
| `freeHuman` | string | `"1.9 GB"` |
| `maintenance` | string | `"normal"`, `"inMaintenance"` |

---

## vSphere Host Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"10.6.46.28"` |
| `id` | string | `"host-10"` |
| `path` | string | `"/Datacenter/host/..."` |
| `cluster` | string | `"domain-s8"` |
| `status` | string | `"green"` |
| `cpuCores` | number | `16` |
| `cpuSockets` | number | `1` |
| `memoryBytes` | number | `49897058304` |
| `inMaintenance` | bool | `false` |
| `managementServerIp` | string | `"10.6.46.248"` |
| `productName` | string | `"VMware ESXi"` |
| `productVersion` | string | `"7.0.0"` |

---

## vSphere Datacenter Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"Datacenter"` |
| `id` | string | `"datacenter-3"` |
| `path` | string | `"/Datacenter"` |

---

## vSphere Folder Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"vm"`, `"windows-vms"` |
| `id` | string | `"group-v4"` |
| `path` | string | `"/Datacenter/vm"` |
| `datacenter` | string | `"datacenter-3"` |
| `children[*].id` | string | `"vm-147"` |
| `children[*].kind` | string | `"VM"`, `"Folder"` |

---

## OpenShift VM Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"fedora-vm"` |
| `id` | string | `"04a6e0e3-..."` |
| `namespace` | string | `"mtv-test"` |
| `powerStateHuman` | string | `"Provisioning"` |
| `diskCapacity` | string | `"0.0 GB"` |
| `criticalConcerns` | number | `0` |
| `warningConcerns` | number | `0` |
| `infoConcerns` | number | `0` |
| `concernsHuman` | string | `"0/0/0"` |

---

## OpenShift Network (NAD) Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"default"` |
| `id` | string | `"b4f1689d-..."` |
| `namespace` | string | `"openshift-ovn-kubernetes"` |
| `hostCount` | number | `0` |

---

## OpenShift Storage (StorageClass) Fields

| Field | Type | Example |
|-------|------|---------|
| `name` | string | `"ocs-storagecluster-ceph-rbd"` |
| `id` | string | `"a8b1ef0c-..."` |
| `object.provisioner` | string | `"openshift-storage.rbd.csi.ceph.com"` |
| `object.reclaimPolicy` | string | `"Delete"` |
| `object.volumeBindingMode` | string | `"Immediate"`, `"WaitForFirstConsumer"` |
| `object.allowVolumeExpansion` | bool | `true` |

---

## VM Query Examples

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where name ~= 'prod-.*'", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where powerState = 'poweredOn' and memoryMB > 4096", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where firmware = 'efi' and guestName ~= '.*Windows.*'", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where any(disks[*].bus = 'nvme')", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where any(disks[*].rdm = true)", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where len(disks) > 1 and len(nics) >= 2", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where criticalConcerns > 0", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where snapshot.id != ''", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where toolsRunningStatus = 'guestToolsRunning'", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory vm", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where powerState = 'poweredOn' order by memoryMB desc limit 10", "output": "markdown" } }
```

---

## Infrastructure Query Examples

```json
mtv_read { "command": "get inventory network", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where name ~= 'VM Network.*'", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory datastore", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where type = 'VMFS' and free < 100Gi", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory datastore", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where maintenance = 'normal' order by free asc", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory host", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where inMaintenance = false and cpuCores >= 16", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory folder", "flags": { "provider": "<PROVIDER>", "namespace": "<NS>", "query": "where path ~= '/Datacenter/vm/.*'", "output": "markdown" } }
```

---

## OpenShift Target Query Examples

```json
mtv_read { "command": "get inventory storage", "flags": { "provider": "host", "namespace": "<NS>", "query": "where name ~= '.*ceph.*'", "output": "markdown" } }
```

```json
mtv_read { "command": "get inventory network", "flags": { "provider": "host", "namespace": "<NS>", "output": "markdown" } }
```
