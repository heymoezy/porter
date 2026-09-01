# Porter Bridge — Hub & Spoke Contract

Canonical location: repo root `/home/lobster/projects/Porter/BRIDGE.md`.
If you're working from `backend/`, this is still the source of truth.

## Endpoint
```
POST http://127.0.0.1:3001/api/v1/chat/stream
```

## Authentication
```
X-Porter-Service-Token: $PORTER_SERVICE_TOKEN
```
Or:
```
Authorization: Bearer $PORTER_SERVICE_TOKEN
```
Localhost only (127.0.0.1). Authenticates as system/platform_admin.

The token lives in `~/.config/porter/porter.env` — never in this repo, never in a
committed `.env`. Source it; do not paste it.

Rotated 2026-07-13. The pre-rotation literal is committed in a
PUBLIC repo and is now **refused as a secret** even if set explicitly
(`backend/src/plugins/auth.ts`). Service auth is fail-closed: no env token → every
machine-to-machine caller gets 401. If you are getting 401 with a token that "used
to work", that is this.

## Request
```json
{
  "message": "your request",
  "backend": "claude_cli|codex_cli|auto"
}
```
`backend` is optional. `auto` lets the routing engine pick.

## Backends

Two registered gateways (the `gateways` table is the source of truth):

| type | name | priority |
|------|------|----------|
| `claude_cli` | Claude CLI | 10 |
| `codex_cli` | Codex CLI | 20 |

## Response
SSE stream of `data: {"token":"..."}` lines, ending with `data: {"done":true,"backend":"...","full_response":"..."}`.

## Working Example
```bash
set -a; . ~/.config/porter/porter.env; set +a

curl -s -H "X-Porter-Service-Token: $PORTER_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3001/api/v1/chat/stream \
  -d '{"message":"say hello","backend":"claude_cli"}'
```

## Observability

All dispatches are logged to `bridge_dispatch_log`. Headless APIs:
- `GET /api/admin/bridge/dispatch-log` — recent dispatch decisions + outcomes
- `GET /api/admin/bridge/costs` — dispatch cost roll-up
