# Porter Bridge — Hub & Spoke Contract

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
  "backend": "ollama|openclaw|auto"
}
```
`backend` is optional. `auto` lets the routing engine pick.

## Response
SSE stream of `data: {"token":"..."}` lines, ending with `data: {"done":true,"backend":"...","full_response":"..."}`.

## Working Example
```bash
curl -s -H "X-Porter-Service-Token: porter-local-service-2026" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3001/api/v1/chat/stream \
  -d '{"message":"say hello","backend":"ollama"}'
```

## Who Uses This
Every gateway on this machine talks to every other through this endpoint:
- Claude Code → Bridge → OpenClaw/Ollama/Gemini/Codex
- OpenClaw → Bridge → Claude/Ollama/Gemini/Codex
- Gemini → Bridge → Claude/OpenClaw/Ollama/Codex
- Codex → Bridge → Claude/OpenClaw/Ollama/Gemini

All dispatches are logged to `bridge_dispatch_log`. All activity visible in the operator activity log.
