# Porter Admin — CLAUDE.md

## Status: SPA ARCHIVED (2026-07-04, PR-2)

The admin React SPA that lived here is archived at `admin/frontend.archived/`
and is NOT built or served. Do not build it, do not extend it, do not follow
old instructions that say "Brain serves Admin static files" — Porter is
headless.

## What replaced it

- **Admin API routes:** `../backend/src/routes/admin/` — still live on `:3001`
  (cookie auth, platform_admin only).
- **Dashboard:** inline brain-ui on `:5176` (`../backend/src/routes/brain-ui.ts`),
  started by the same porter-fastify process.

## Commands

```bash
systemctl --user restart porter-fastify   # backend + brain-ui
curl -s http://127.0.0.1:3001/health      # expect current version
```

## Monorepo Layout

Part of the Porter monorepo (`heymoezy/porter`), repo root
`/home/lobster/projects/Porter/`. The Brain (`../backend/`) is the sole
running process and owns PostgreSQL (`porter` db).
