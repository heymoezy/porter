# Porter admin reframe around products/tenants (task #27)

> Council-ratified design (codex, 2026-07-08). Source brief: scratchpad/council-27-body.json.
> Foundational — surface to Moe before the destructive later releases (R5/R6/R10 delete Brain/Recall/Bridge).

**Target IA**

| Level | Section | Scope | Purpose |
|---|---|---:|---|
| Global header | `Tenant / Product Switcher` | Global | Select `tenant`, `product`, or `Porter system` context |
| Primary nav | `Overview` | Per-product | Health, recent activity, open items, release status |
| Primary nav | `Vault` | Per-product | Schemas, nodes, placements, edges, artifacts, resolved scope view |
| Primary nav | `Services` | Per-product | Registered apps, ingestors, jobs, APIs, sync status |
| Primary nav | `Files` | Per-product | Uploaded/generated artifacts, source files, vault-linked assets |
| Primary nav | `Open Items` | Per-product | Tasks, unresolved edges, ingestion failures, review queues |
| Primary nav | `Releases` | Per-product | App/data/schema release history and deployment controls |
| Primary nav | `Products` | Global tenant | Products under selected tenant; create/register/manage products |
| Primary nav | `Tenants` | Global Porter | Tenant/customer registry; Moe is one tenant |
| Primary nav | `System` | Global Porter | Porter engine health, workers, DB, scopes, admin controls |

**Switcher Model**

| Decision | Concrete Behavior |
|---|---|
| Selector type | Global context selector in the app shell |
| Context levels | `Porter System` → `Tenant` → `Product` |
| Default | Last selected product, fallback to first tenant/product |
| Per-product sections | `Overview`, `Vault`, `Services`, `Files`, `Open Items`, `Releases` |
| Tenant sections | `Products`, tenant-level vault overlays, tenant settings |
| Global sections | `Tenants`, `System` |
| Scope display | Product pages always show resolved ladder, e.g. `ymc -> moe -> porter` |
| No per-section selector | Individual pages inherit shell context; only allow local filters, not context switching |

**Surface Disposition**

| Existing Surface | Action | Destination |
|---|---|---|
| `Brain` | Delete as top-level concept | Merge into `Vault` |
| `Recall` | Delete as top-level concept | Merge into `Vault > Artifacts / Nodes / Search` |
| `Dashboard` | Rename/reframe | Becomes per-product `Overview` |
| `Bridge` | Merge/delete as standalone | Move integration/status pieces into `Services`; manual controls into `System` |
| `vault` | Promote | Becomes core `Vault` section |
| `projects` | Rename/split | Product records become `Products`; project-specific views become selected product context |
| Legacy app-specific admin pages | Keep only if mapped | Move under selected product as `Services`, `Files`, `Open Items`, or `Releases` |
| Any Brain/Recall nav labels | Remove | Do not alias publicly; old routes may redirect temporarily |

**Vault IA**

| Vault Tab | Contents |
|---|---|
| `Resolved View` | Effective injected knowledge for selected product using scope ladder |
| `Schemas` | Registered app schemas, versions, validation status |
| `Nodes` | Vault nodes by type/source/product |
| `Placements` | Where nodes are injected/rendered/used |
| `Edges` | Relationships, dependencies, references |
| `Artifacts` | Files, generated outputs, ingested documents |
| `Scopes` | Product, tenant, Porter inheritance and overrides |
| `Search` | Unified replacement for Recall-style lookup |

**Release Plan**

| Release | Goal | Changes | Shippable Because |
|---|---|---|---|
| R1 | Add context foundation | Add global tenant/product selector; persist selected context; add route context plumbing; no old nav removed | Existing pages still work unchanged |
| R2 | Create new shell IA | Add new primary nav: `Overview`, `Vault`, `Services`, `Files`, `Open Items`, `Releases`, `Products`, `Tenants`, `System`; keep legacy links behind secondary/hidden group | Users can enter new IA without losing old surfaces |
| R3 | Reframe Dashboard | Move current Dashboard widgets into per-product `Overview`; filter all data by selected product; add scope ladder badge | First product-native page ships |
| R4 | Promote Vault | Make `Vault` the canonical section; add tabs for schemas/nodes/placements/edges/artifacts/scopes/search; wire to vault v2 tables | Vault becomes visible backbone while legacy Brain/Recall still exist |
| R5 | Fold Recall | Move Recall search/history/entity lookup into `Vault > Search` and relevant vault tabs; redirect old Recall route to Vault Search | Recall disappears from nav without breaking URLs |
| R6 | Fold Brain | Move Brain graph/memory/entity views into `Vault > Nodes`, `Edges`, `Resolved View`; redirect old Brain route to Vault | Brain disappears from nav without data migration risk |
| R7 | Split Bridge | Move app/service registration, syncs, jobs, API status into `Services`; move admin/manual engine controls into `System` | Bridge functionality survives under clearer ownership |
| R8 | Reframe Projects | Rename project registry to `Products`; attach products to tenant; expose Moe → `ymc`, `themozaic`, `baanyindee`, `askporter` | Product model becomes the user-facing unit |
| R9 | Product ops pages | Add product-scoped `Files`, `Open Items`, `Releases`; migrate existing file/task/release widgets into them | Admin matches Moe directive: product vault/services/files/items/releases |
| R10 | Remove obsolete surfaces | Delete top-level `Brain`, `Recall`, `Bridge`, old `Dashboard`, old `projects` nav/routes after redirects have shipped | Final IA has no legacy concepts exposed |

**Route Shape**

| Route | Scope |
|---|---|
| `/admin/:tenant/:product/overview` | Product |
| `/admin/:tenant/:product/vault` | Product |
| `/admin/:tenant/:product/services` | Product |
| `/admin/:tenant/:product/files` | Product |
| `/admin/:tenant/:product/open-items` | Product |
| `/admin/:tenant/:product/releases` | Product |
| `/admin/:tenant/products` | Tenant |
| `/admin/tenants` | Porter global |
| `/admin/system` | Porter global |

**Non-Negotiables**

| Rule | Enforcement |
|---|---|
| No `Brain` nav | Delete label; redirect only |
| No `Recall` nav | Delete label; functionality lives in Vault |
| No app-first IA | Product selector controls the admin experience |
| No Porter-as-product confusion | Porter is system/global scope, not a customer product |
| No patch layer | Legacy pages are migrated, renamed, then removed |
| Headless endgame | Admin only visualizes and manually controls vault/services engine |
