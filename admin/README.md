# Porter SaaS Admin

Platform control plane for Porter. Internal-only, platform_admin access.

## Architecture

```
Porter (product)          SaaS Admin (platform)
:8877 porter.py           :5180 admin backend
:3001 fastify backend     :5175 admin frontend (dev)
:5173 frontend-v2 (dev)
         \                  /
          \                /
           porter.db (shared, WAL mode)
```

## Quick Start

```bash
# Backend
cd admin/backend
npm install
PORTER_DB_PATH=/path/to/porter.db npm run dev

# Frontend (separate terminal)
cd admin/frontend
npm install
npm run dev
```

- Admin backend: http://127.0.0.1:5180
- Admin frontend (dev): http://127.0.0.1:5175

## Auth

Uses the same `porter_session` cookie as Porter product. Requires `role === 'platform_admin'`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/admin/health | Public | Health check + DB status |
| GET | /api/admin/users | Admin | Paginated user list |
| GET | /api/admin/users/:username | Admin | User detail + sessions |
| PUT | /api/admin/users/:username/role | Admin | Change user role |
| DELETE | /api/admin/users/:username | Admin | Delete user |
| GET | /api/admin/email/config | Admin | SMTP config status |
| GET | /api/admin/email/queue | Admin | Email queue stats |
| GET | /api/admin/billing/subscriptions | Admin | All subscriptions |
| GET | /api/admin/billing/events | Admin | Webhook event log |
| GET | /api/admin/billing/stats | Admin | Billing summary |
| GET | /api/admin/services | Admin | System health cards |

## Phases

1. **Scaffold + Auth** — boots, authenticates, gates on platform_admin
2. **Email Engine** — SMTP, queue, templates, verification
3. **User Management** — full lifecycle, suspend, reset, verify
4. **Billing Admin + Services** — subscription overrides, health monitoring
