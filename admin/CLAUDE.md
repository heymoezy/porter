# Porter Admin — CLAUDE.md

## Status: SPA RESTORED + LIVE at askporter.app (2026-07-06)

The 2026-07-04 "archived" call (PR-2) was reversed — the admin React SPA at
`admin/frontend.archived/` (directory name is a stale historical artifact,
kept as-is to avoid an unnecessary rename churn) is BUILT and SERVED in
production. Do build it, do extend it. It is a static SPA build, not a
Node server: Caddy serves the built files directly and reverse-proxies
`/api/*` to the Fastify brain — Porter itself stays headless (no admin
process, no `porter-admin.service`; that unit is stale/disabled, ignore it).

## How it ships

```bash
bash /home/lobster/projects/Porter/admin/deploy.sh
```

This runs `npm run build` in `frontend.archived/` (react-router SPA build)
then `rsync -a --delete build/client/ /home/websites/porter/admin/`. Caddy
picks up the new static files immediately — no service restart needed for a
frontend-only change. `/home/lobster` is mode 700 so Caddy can't read the
source tree directly; that's why the rsync-out step exists (same pattern as
`ymc.capital/deploy.sh`).

**Routing today (askporter.app):**
- `/api/*` → `reverse_proxy 127.0.0.1:3001` (this Fastify brain)
- everything else → `file_server` on `/home/websites/porter/admin`, SPA
  fallback to `index.html`

This routing is **durable as of 2026-07-29** — the static root, the `/api`
proxy and a JSON access log live in `/etc/caddy/Caddyfile` (applied by Moe with
sudo). It is no longer an ephemeral admin-API patch, so it survives a
`caddy reload` and does not need re-applying.

## What else is here

- **Admin API routes:** `../backend/src/routes/admin/` — live on `:3001`
  (cookie auth, platform_admin only). The SPA calls these via `/api/*`.
- ⚠️ **There is no brain-ui on `:5176`.** It was deleted as dead code in
  v6.61.0 and nothing listens on that port. This SPA is the only admin surface.

## Commands

```bash
bash admin/deploy.sh                      # build + ship the admin SPA
systemctl --user restart porter-fastify   # backend + brain-ui (backend changes only)
curl -s http://127.0.0.1:3001/health      # expect current version
curl -s https://askporter.app/            # expect 200, admin SPA HTML
tail -f /var/log/caddy/askporter-access.log  # who is hitting the public host
```

## Monorepo Layout

Part of the Porter monorepo (`heymoezy/porter`), repo root
`/home/lobster/projects/Porter/`. The Brain (`../backend/`) is the sole
running backend process and owns PostgreSQL (`porter` db). The admin SPA
build has no backend of its own — it's a pure static asset tree.
