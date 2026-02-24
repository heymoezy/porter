# Durable Checkpointing and Resume
## Preventing Lost Work During API Limits or Interruptions

## 1) Problem
When OpenClaw or Claude Code is mid-task and an API limit is reached, in-memory progress can be lost if work is only saved at the end.

## 2) Goal
Persist progress continuously so interrupted tasks can resume safely without rework.

---

## 3) Design pattern
Use five mechanisms together:
1. Write-ahead log
2. Chunked writes
3. Lease + heartbeat
4. Atomic finalize
5. Resume protocol

---

## 4) Write-ahead log
Before each meaningful step, append an entry to a task log.

### Required fields
- task_id
- step_id
- operation
- target_uri
- status (`started`, `partial`, `done`, `failed`)
- timestamp
- metadata (optional)

### Example
```json
{"task_id":"t_20260224_001","step_id":"s12","operation":"append_chunk","target_uri":"porter://projects/dfsa/drafts/master.md","status":"partial","timestamp":"2026-02-24T06:50:10Z","metadata":{"bytes":1024}}
```

Storage:
- `porter://runtime/checkpoints/<task_id>.jsonl`

---

## 5) Chunked draft writes
Do not write large outputs in one operation.

### Rule
- flush every 20-30 seconds or every N lines/bytes
- each chunk is independently durable

### Recommended paths
- `porter://runtime/drafts/<task_id>/part-0001.md`
- `porter://runtime/drafts/<task_id>/part-0002.md`

On completion, merge chunks into canonical file.

---

## 6) Lease and heartbeat
Create a lease file at task start and refresh heartbeat periodically.

Lease file:
- owner (`openclaw` or `claude-code`)
- task_id
- started_at
- last_heartbeat
- expires_at
- state (`running`, `interrupted`, `complete`)

Storage:
- `porter://runtime/leases/<task_id>.json`

If heartbeat expires, mark as interrupted and trigger resume flow.

---

## 7) Atomic finalize
Never overwrite final files directly.

### Steps
1. Build final output at temp URI
2. Validate (non-empty, checksum/length, optional schema)
3. Atomic rename/move to canonical URI
4. Mark final log step as `done`

Example URIs:
- temp: `porter://runtime/tmp/<task_id>.final.md`
- final: `porter://projects/dfsa/interview-pack.md`

---

## 8) Resume protocol
On task restart:
1. Read lease status
2. Read checkpoint log
3. Detect last successful step
4. Recover existing chunks
5. Continue from first incomplete step

### Conflict safety
If multiple agents resume same task:
- lease owner wins
- others go read-only unless ownership transferred

---

## 9) API additions (recommended)
### `POST /runtime/checkpoint`
Append checkpoint entry.

### `POST /runtime/heartbeat`
Refresh task lease heartbeat.

### `GET /runtime/recover?task_id=...`
Return resume state:
- latest step
- chunk list
- lease status

### `POST /runtime/finalize`
Perform validated atomic promotion from temp to final.

---

## 10) Minimal implementation rules
- Log before and after each meaningful write
- Never keep >30 seconds of unsaved generated output
- Keep all partial chunks until finalize succeeds
- Resume must be deterministic from logs alone

---

## 11) Success criteria
- Zero lost work on API-limit interruption
- Restart resumes from last checkpoint, not from scratch
- Canonical files are only updated via atomic finalize
- Operator can inspect progress at any time through checkpoints

---

## 12) Integration note for existing Porter
This is additive and optional.
- No change to current Porter file workflows.
- Runtime checkpointing lives under `porter://runtime/...`.
- Existing users are unaffected unless feature is enabled.
