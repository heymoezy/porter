# Porter Files directory — graph-organized, content-deduped, in-sync (Moe directive 2026-07-08)

> "all documents within the apps should be visible in porter files directory, properly organised in a way that reflects the knowledge graph. these should be in perfect sync completely deduped"

> Council-ratified (codex). Supersedes the separate #27-admin-R1 and #28-dedup approaches: the Files directory IS the deliverable. Physical hardlink dedup (1.06GB) is OPTIONAL/independent — Files depends on LOGICAL (content-hash) dedup only.

**Decision**
- Dedup boundary: `app_scope + sha256`.
- Node identity: `vault_nodes.external_id = 'content:sha256:<hash>'`, `type='document'`.
- Same content in the same app = one document node.
- Same content across different apps = separate scoped nodes, optionally linked by shared `sha256`, not merged across tenants.

**Data Model**
```txt
vault_nodes
  app_scope
  type=document
  external_id=content:sha256:<sha256>
  metadata.content_hash
  metadata.canonical_path
  metadata.canonical_location_id
  metadata.display_name

vault_artifacts
  node_id=document_node_id
  content_hash=<sha256>
  path=<canonical_path>              # backward-compatible primary path
  metadata.location_count
  metadata.locations_preview[]       # derived, not source of truth

vault_artifact_locations             # new source of truth
  app_scope
  artifact_id
  document_node_id
  absolute_path
  project_node_id
  documents_root_node_id
  folder_node_id
  relative_path
  basename
  size_bytes
  mtime_ns
  dev
  inode
  first_seen_at
  last_seen_at
  missing_since
  present
  scan_id
  unique(app_scope, absolute_path)
```

Canonical path rule:
```txt
active locations only
1. shallowest path depth
2. shortest absolute path
3. lexicographic path
```

**Graph Representation**
```txt
app_scope
  -> project node
    -> documents_root container
      -> folder container(s)
        -> document node
```

- Physical paths: `vault_artifact_locations`.
- Logical hierarchy: `vault_placements`.
- Semantic graph index: `vault_edges`.

```txt
vault_placements
  parent_node_id = folder/documents_root/project container
  child_node_id  = folder/document node
  metadata.location_id
  metadata.relative_path
  metadata.basename
  active=true|false

vault_edges
  project_node_id -> document_node_id
  kind='has_document'
  metadata.location_count
  active=true|false
```

A deduped document in multiple projects:
```txt
one document node
N artifact_locations
N placements under the relevant project/folder containers
N project->document edges or one edge per project
```

**Files UI**
```txt
Files
  ymc
    Project A
      Documents
        folder
          contract.pdf      # placement row, same document_node_id/hash
    Project B
      Documents
        folder
          contract.pdf      # another placement row, same document_node_id/hash

  themozaic
    ...

  baanyindee
    ...
```

- Tree renders placement instances, not raw filesystem paths.
- Document details panel shows:
```txt
content hash
canonical path
all active locations
projects containing this document
last seen
size
mtime
```
- Multi-project docs appear in each project tree where the graph places them.
- Badge: `deduped: N locations`.

**Privacy**
- Privacy exclusions enforced twice:
```txt
1. app-side scanner excludes before hashing/POST
2. Porter /vault/ingest rejects denied paths
```
- Excluded paths never create:
```txt
nodes
artifacts
locations
placements
edges
search rows
UI rows
```
- Denylist includes personal roots such as:
```txt
moe-personal
Estate
tax
passports
personal-financials
```

**Sync**
- Apps scan their declared document roots only.
- Each scan creates `scan_id`.
- For every allowed file:
```txt
stat path
if size/mtime changed or unknown: sha256
POST /vault/ingest kind=raw_file
  app_scope
  content_hash
  absolute_path
  project_key/project_node_id
  relative_path
  folder_segments
  size
  mtime_ns
  scan_id
```

Porter ingest behavior:
```txt
upsert document by app_scope + sha256
upsert artifact by document_node_id + sha256
upsert location by app_scope + absolute_path
upsert folder containers
upsert placements
upsert project->document edge
recompute canonical location
```

After scan:
```txt
POST /vault/reconcile
  app_scope
  scan_id
  scanned_roots[]
```

Reconcile behavior:
```txt
locations under scanned roots not seen in scan => present=false
their placements => active=false
project edges recomputed
documents with zero active locations => hidden from Files, retained as tombstone
```

Change cases:
```txt
same path, new hash:
  old location inactive
  new document/location/placement active

new path, same hash:
  same document node
  new location + placement

deleted file:
  location present=false
  placement inactive
  document hidden if no active locations

move:
  old location inactive
  new location active
  same document node if hash unchanged
```

Cadence:
```txt
every_24h Porter tick: enqueue sync per app_scope
admin button: sync now per app/project
optional future: app-side watcher pushes faster updates
```

**Cross-App**
```txt
top-level UI = app_scope
ymc
themozaic
baanyindee
```

- Each app owns scanner config, project mapping, exclusions.
- Same `sha256` across apps is not merged into one node.
- Optional admin-only “same content across apps” view can group by hash, but Files remains app-scoped.

**Logical vs Physical Dedup**
- Required: vault logical dedup.
```txt
one document node per app_scope + content hash
many graph placements
many physical locations
```

- Optional: filesystem hardlink dedup.
```txt
saves disk
does not affect Files UI
does not change vault identity
must be opt-in and dry-run first
only for immutable document sets
```

Files must not depend on hardlinks. Physical dedup can happen later from `vault_artifact_locations` groups by `sha256`.

**Build Plan**
**R1 — Additive Schema**
- Add `vault_artifact_locations`.
- Add indexes for `app_scope + content_hash`, `app_scope + absolute_path`.
- Add placement `metadata.location_id`.
- Add Porter-side privacy reject list.
- No ingest behavior change.

**R2 — Content-Hash Ingest Compatibility**
- Update `/vault/ingest raw_file`.
- If `content_hash` exists, resolve document by `app_scope + sha256`.
- Keep accepting legacy `externalId=file:<sha1(path)>`.
- Store legacy external IDs as aliases to the content node.
- Upsert location, artifact, folders, placements, edges.

**R3 — Backfill Existing YMC Vault**
- Dry-run group existing document nodes by `app_scope + artifact.content_hash`.
- Create one content document node per hash.
- Move/clone existing placements onto content nodes.
- Populate `vault_artifact_locations`.
- Mark old per-path nodes as superseded, not deleted.
- Validate counts: documents, locations, placements, hidden privacy paths = zero.

**R4 — Reconcile Job**
- Add scan lifecycle:
```txt
start scan
ingest files
complete scan
reconcile missing paths
```
- Hook ymc sync into Porter `every_24h`.
- Add admin “sync now”.
- Hide inactive placements from Files APIs.

**R5 — Files API**
- Add:
```txt
GET /admin/api/files/apps
GET /admin/api/files/tree?app_scope=...
GET /admin/api/files/document/:node_id
POST /admin/api/files/sync
```
- API returns placement rows with shared `document_node_id`.

**R6 — Files UI**
- Add Porter admin Files tree:
```txt
app -> project -> documents_root -> folders -> documents
```
- Add document detail panel with all locations.
- Add dedupe badge and freshness status.
- Ship through `admin/deploy.sh`.

**R7 — Cross-App Rollout**
- Add scanner configs for `themozaic` and `baanyindee`.
- Enforce same privacy exclusions.
- Enable per-app sync status in Files.
- Keep app scopes visually separate.

**R8 — Optional Physical Dedup**
- Generate hardlink candidate report from `vault_artifact_locations`.
- Dry-run first.
- Apply only to approved immutable document roots.
- No Files UI dependency.
