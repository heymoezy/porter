-- Scope ladder + product registry — the identity spine (R4.0/R5).
-- Porter's vault engine keys everything on a single `app_scope` text column,
-- but tenant / product(app) / project / global are 4 different concepts.
-- This gives that column a real backing DAG so knowledge injection can
-- resolve "global ∪ current scope" (the injection chain) without risking
-- cross-tenant or cross-app leakage. Does not touch any existing vault_* row —
-- vault_scopes.id IS the value apps already pass as app_scope.

CREATE TABLE IF NOT EXISTS vault_scopes (
  id               text PRIMARY KEY,
  scope_kind       text NOT NULL,
  parent_scope_id  text,
  tenant_id        text,
  label            text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at       double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS vault_scopes_scope_kind_idx ON vault_scopes (scope_kind);
CREATE INDEX IF NOT EXISTS vault_scopes_parent_scope_idx ON vault_scopes (parent_scope_id);

CREATE TABLE IF NOT EXISTS products (
  id             text PRIMARY KEY,
  tenant_id      text NOT NULL,
  scope_id       text NOT NULL,
  name           text NOT NULL,
  slug           text NOT NULL,
  kind           text NOT NULL DEFAULT 'product',
  repo_path      text,
  frontend       jsonb NOT NULL DEFAULT '{}'::jsonb,
  backend        jsonb NOT NULL DEFAULT '{}'::jsonb,
  services       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ports          jsonb NOT NULL DEFAULT '{}'::jsonb,
  bridge_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  tools          jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at     double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS products_tenant_idx ON products (tenant_id);
CREATE INDEX IF NOT EXISTS products_scope_idx ON products (scope_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products (slug);

-- Seed the base ladder: porter (global root) -> moe (tenant) -> ymc (app).
-- Maps the EXISTING app_scope='ymc' vault data onto the new ladder; idempotent.
INSERT INTO vault_scopes (id, scope_kind, parent_scope_id, tenant_id, label)
VALUES ('porter', 'global', NULL, NULL, 'Porter (global root)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vault_scopes (id, scope_kind, parent_scope_id, tenant_id, label)
VALUES ('moe', 'tenant', 'porter', 'moe', 'Moe (operator tenant)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vault_scopes (id, scope_kind, parent_scope_id, tenant_id, label)
VALUES ('ymc', 'app', 'moe', 'moe', 'YMC Capital')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, tenant_id, scope_id, name, slug, kind, repo_path, frontend, backend)
VALUES (
  'ymc', 'moe', 'ymc', 'YMC Capital', 'ymc', 'product',
  '/home/lobster/projects/ymc.capital',
  '{"port": 5180}'::jsonb,
  '{"port": 5182, "service": "ymc-backend"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
