# Porter Bridge — Hub & Spoke Contract

Canonical location: repo root `/home/lobster/projects/Porter/BRIDGE.md`.
If you're working from `backend/`, this is still the source of truth.

## Endpoint
```
POST http://127.0.0.1:3001/api/v1/chat/stream
```

## Authentication
```
X-Porter-Service-Token: porter-local-service-2026
```
Or:
```
Authorization: Bearer porter-local-service-2026
```
Localhost only (127.0.0.1). Authenticates as system/platform_admin.

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
curl -s -H "X-Porter-Service-Token: porter-local-service-2026" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3001/api/v1/chat/stream \
  -d '{"message":"say hello","backend":"claude_cli"}'
```

## Observability

All dispatches are logged to `bridge_dispatch_log`. Headless APIs:
- `GET /api/admin/bridge/dispatch-log` — recent dispatch decisions + outcomes
- `GET /api/admin/bridge/costs` — dispatch cost roll-up
