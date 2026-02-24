# Porter Runtime — Generated Paths

These directories are created automatically at server startup by `ensure_runtime_dirs()`.
They hold ephemeral agent state and are intentionally excluded from version control.

## Directory layout

```
runtime/
  checkpoints/   <task_id>.jsonl   — write-ahead log; one JSON line per step
  leases/        <task_id>.json    — owner, heartbeat timestamp, expiry, state
  drafts/        <task_id>/        — chunked draft fragments accumulated mid-task
  tmp/           <task_id>.*       — staging area for atomic finalize promotion

memory/
  projects/      project-scoped notes, specs, context snippets
  people/        contact and contributor records
  decisions/     ADRs and decision logs
  compliance/    legal, policy, audit artefacts
  transcripts/   session or call transcripts
  artifacts/     build outputs, generated assets
  indexes/       derived search indexes
  pointers/      <id>.json — structured pointers into other memory files
```

## Lifecycle

| Phase | Files touched |
|---|---|
| Agent starts | `leases/<task>.json` created via `POST /runtime/heartbeat` |
| Each step | `checkpoints/<task>.jsonl` appended via `POST /runtime/checkpoint` |
| Mid-task resume | `GET /runtime/recover?task_id=` — checks lease expiry + last status |
| Work-in-progress | staged under `drafts/<task>/` |
| Task complete | `POST /runtime/finalize` — atomic `os.replace(tmp → final)`, lease state → complete |

## Resume semantics

`resumable = True` only when all four conditions hold:
1. A lease file exists for the task.
2. `lease.expires_at > now` (not expired).
3. `lease.state` is `running` or `interrupted`.
4. The last checkpoint entry's `status` is not `done`.

`lease_expired` is always returned in the `/runtime/recover` response so callers can
distinguish "never started" (no lease) from "was running but expired".

## Heartbeat TTL bounds

`POST /runtime/heartbeat` accepts `ttl` in **30–3600 seconds** (default 300).
Values outside this range are rejected with HTTP 400.

## Atomic promotion

`POST /runtime/finalize` uses `os.replace(temp, final)` which is atomic on POSIX
systems when source and destination are on the same filesystem (which they always
are here — both are under `MEMORY_DIR`).
