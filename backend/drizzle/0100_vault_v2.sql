-- Vault v2 — generic knowledge-graph engine (R1a: schema).
-- Porter owns the engine; apps declare node-types and push data. No app concepts here.

CREATE TABLE IF NOT EXISTS vault_schemas (
  app_scope   text PRIMARY KEY,
  node_types  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at  double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS vault_nodes (
  id          text PRIMARY KEY,
  app_scope   text NOT NULL,
  external_id text NOT NULL,
  layer       text NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at  double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS vault_nodes_scope_layer_type_idx ON vault_nodes (app_scope, layer, type);
CREATE UNIQUE INDEX IF NOT EXISTS vault_nodes_scope_external_idx ON vault_nodes (app_scope, external_id);

CREATE TABLE IF NOT EXISTS vault_placements (
  id           text PRIMARY KEY,
  app_scope    text NOT NULL,
  node_id      text NOT NULL,
  parent_id    text,
  layer        text NOT NULL,
  state        text NOT NULL DEFAULT 'proposed',
  confidence   double precision,
  proposed_by  text NOT NULL DEFAULT 'ai',
  reviewed_by  text,
  reviewed_at  double precision,
  created_at   double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS vault_placements_scope_parent_state_idx ON vault_placements (app_scope, parent_id, state);
CREATE INDEX IF NOT EXISTS vault_placements_scope_node_idx ON vault_placements (app_scope, node_id);
CREATE UNIQUE INDEX IF NOT EXISTS vault_placements_one_active_idx ON vault_placements (app_scope, node_id, layer) WHERE state = 'active';

CREATE TABLE IF NOT EXISTS vault_edges (
  id           text PRIMARY KEY,
  app_scope    text NOT NULL,
  from_node_id text NOT NULL,
  to_node_id   text NOT NULL,
  kind         text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS vault_edges_scope_from_idx ON vault_edges (app_scope, from_node_id);
CREATE INDEX IF NOT EXISTS vault_edges_scope_to_idx ON vault_edges (app_scope, to_node_id);

CREATE TABLE IF NOT EXISTS vault_artifacts (
  id            text PRIMARY KEY,
  app_scope     text NOT NULL,
  node_id       text NOT NULL,
  kind          text NOT NULL,
  source_system text,
  source_id     text,
  path          text,
  content_hash  text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS vault_artifacts_scope_node_idx ON vault_artifacts (app_scope, node_id);

CREATE TABLE IF NOT EXISTS vault_derivative_jobs (
  id                     text PRIMARY KEY,
  app_scope              text NOT NULL,
  source_artifact_id     text NOT NULL,
  derivative_artifact_id text,
  status                 text NOT NULL DEFAULT 'missing',
  source_hash            text,
  generated_hash         text,
  error                  text,
  created_at             double precision NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  generated_at           double precision
);
CREATE INDEX IF NOT EXISTS vault_derivative_jobs_scope_status_idx ON vault_derivative_jobs (app_scope, status);
CREATE INDEX IF NOT EXISTS vault_derivative_jobs_source_idx ON vault_derivative_jobs (source_artifact_id);
