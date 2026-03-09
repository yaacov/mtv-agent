---
name: inventory-tool-guide
description: Guide for querying MTV provider inventory with TSL. Covers available resources per provider, output formats, TSL syntax, and using inventory for network/storage mapping. Use when querying provider inventory.
---

# Inventory Tool Guide

Use `mtv_read` with `get inventory RESOURCE` to query provider inventory. Use `mtv_help` for unfamiliar commands.

For field references and ready-to-use queries see the `inventory-query-cookbook` skill.

---

## Available Resources by Provider

All providers support: `vm`, `network`, `storage`

Additional resources per provider:

- **vSphere**: `datastore`, `host`, `cluster`, `datacenter`, `folder`
- **oVirt**: `host`, `cluster`, `datacenter`, `disk`, `disk-profile`, `nic-profile`
- **OpenStack**: `volume`, `volumetype`, `flavor`, `image`, `project`, `instance`, `subnet`
- **EC2**: `ec2-instance`, `ec2-network`, `ec2-volume`, `ec2-volume-type`
- **OpenShift**: `namespace`, `pvc`, `data-volume`

Note: vSphere disk data is only available as sub-fields within VM objects (`disks[*].*`), not as a standalone resource.

---

## Output Formats

| Format | Use when |
|--------|----------|
| `markdown` | Presenting results to the user (default). |
| `json` | Parsing results or discovering fields. |
| `table` | Compact display. |
| `yaml` | Structured output. |
| `planvms` | Export for `create plan --vms @file`. |

---

## TSL Query Syntax

Structure: `[SELECT fields] WHERE condition [ORDER BY field [ASC|DESC]] [LIMIT n]`

### Operators

- **Comparison**: `=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`
- **String**: `like` (% wildcard), `ilike` (case-insensitive), `~=` (regex), `~!` (regex not)
- **Logical**: `and`, `or`, `not`
- **Set**: `in [...]`, `not in [...]`, `between X and Y`
- **Null**: `is null`, `is not null`

### Array Functions

- `len(field)` -- array length: `where len(disks) > 1`
- `any(field[*].sub = 'val')` -- any element matches: `where any(concerns[*].category = 'Critical')`
- `all(field[*].sub >= N)` -- all elements match
- `sum(field[*].sub)` -- sum of values: `where sum(disks[*].capacity) > 100Gi`

### Array Access

- `field[0]` -- index access
- `field[*].sub` -- wildcard across elements
- `field.sub` -- implicit traversal (same as `field[*].sub`)

### SI Units

`Ki` (1024), `Mi` (1024^2), `Gi` (1024^3), `Ti` (1024^4)

---

## Using Inventory for Mapping

### Network mapping

1. List source networks: `get inventory network` with source provider
2. List target NADs: `get inventory network` with `provider: "host"`
3. Match by name, use in `create mapping network`

```json
mtv_read { "command": "get inventory network", "flags": { "provider": "<SOURCE>", "namespace": "<NS>", "output": "json" } }
```

### Storage mapping

1. List source datastores: `get inventory datastore` with source provider
2. List target StorageClasses: `get inventory storage` with `provider: "host"`
3. Match by name, use in `create mapping storage`

```json
mtv_read { "command": "get inventory datastore", "flags": { "provider": "<SOURCE>", "namespace": "<NS>", "output": "json" } }
```
