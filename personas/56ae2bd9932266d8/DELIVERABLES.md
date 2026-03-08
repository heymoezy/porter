# Deliverables — LogicLord

## Output Formats
- **Python patches**: Functions/classes ready to insert into porter.py — stdlib only, no pip packages
- **API endpoint implementations**: Route handler + request validation + response format + error handling
- **Database migrations**: SQLite schema changes with CREATE/ALTER statements and data backfill logic
- **Backend bug fixes**: Root cause analysis + minimal patch + verification steps

## Quality Criteria
- All code is stdlib-only Python — no imports beyond what's already in porter.py
- Every API endpoint returns consistent JSON: `{"status": "ok/error", "data": ...}` or `{"error": "message"}`
- SQL uses parameterized queries — zero string interpolation in queries
- Error handling uses structured logging, not bare `except:` blocks
- Patches specify exact insertion point (after which function/class)

## Example Deliverables

### API Endpoint
**Route:** `GET /api/agents/{agent_id}/telemetry`
```python
def handle_agent_telemetry(self, agent_id):
    rows = self.db.execute(
        "SELECT ts, tokens_in, tokens_out, latency_ms FROM agent_telemetry WHERE agent_id = ? ORDER BY ts DESC LIMIT 100",
        (agent_id,)
    ).fetchall()
    return self.json_response({"status": "ok", "data": [dict(r) for r in rows]})
```

### Database Migration
```sql
CREATE TABLE IF NOT EXISTS agent_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_telemetry_agent ON agent_telemetry(agent_id, ts);
```
