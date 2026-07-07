/**
 * Porter MCP — product/registry helpers.
 *
 * Backs porter_select_product / porter_list_files / porter_list_services /
 * porter_list_tools. A `products` table (products, per-product frontend/
 * backend/services/ports/tools jsonb) is landing from a PARALLEL
 * workstream. Everything here detects it at runtime via information_schema
 * and reads it defensively (jsonb shapes normalized, never assumed) so this
 * keeps working whichever order the two workstreams finish in — before the
 * table exists, after it exists empty, and after it's populated.
 */

import { pool } from '../db/client.js';

/** True if a table exists in the public schema. Never throws. */
export async function tableExists(name: string): Promise<boolean> {
  const row = (await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  )).rows[0];
  return !!row;
}

interface ProductRow {
  id: string;
  tenant_id: string;
  scope_id: string;
  name: string;
  slug: string;
  kind: string;
  repo_path: string | null;
  frontend: Record<string, unknown>;
  backend: Record<string, unknown>;
  services: Record<string, unknown> | unknown[];
  ports: Record<string, unknown>;
  tools: unknown[];
}

/** Look up a scope's row in `products`, by scope_id / id / slug. Null if the table or row doesn't exist. */
async function getProductRow(scope: string): Promise<ProductRow | null> {
  if (!(await tableExists('products'))) return null;
  const row = (await pool.query(
    `SELECT id, tenant_id, scope_id, name, slug, kind, repo_path, frontend, backend, services, ports, tools
     FROM products WHERE scope_id = $1 OR id = $1 OR slug = $1 LIMIT 1`,
    [scope]
  )).rows[0] as ProductRow | undefined;
  return row ?? null;
}

export interface ProductSelection {
  scope: string;
  registered: boolean;
  ancestors: string[];
  registryAvailable: boolean;
  product?: { id: string; name: string; kind: string; repoPath: string | null; tenantId: string };
  note?: string;
}

/**
 * Select a scope as the active product for this MCP session. Reports
 * whether the scope has a registered vault schema, and — if `products` has
 * a row for this scope — its identity. `products` has no parent-scope
 * column today, so the ancestor chain stays scope-only until the registry
 * grows that concept.
 */
export async function selectProduct(scope: string): Promise<ProductSelection> {
  const registered = (await pool.query(
    `SELECT 1 FROM vault_schemas WHERE app_scope = $1`,
    [scope]
  )).rows.length > 0;

  const registryAvailable = await tableExists('products');
  const product = registryAvailable ? await getProductRow(scope) : null;

  return {
    scope,
    registered,
    ancestors: [scope],
    registryAvailable,
    product: product
      ? { id: product.id, name: product.name, kind: product.kind, repoPath: product.repo_path, tenantId: product.tenant_id }
      : undefined,
    note: !registryAvailable
      ? 'no products registry yet — ancestor chain unavailable, scope pinned directly'
      : product
        ? 'products row found; no parent-scope column in the registry yet, so ancestor chain stays scope-only'
        : `products registry exists but has no row for scope "${scope}" yet`,
  };
}

export interface FileEntry {
  nodeId: string;
  title: string;
  kind: string;
  path: string | null;
  sourceSystem: string | null;
  contentHash: string | null;
  createdAt: number;
}

const MAX_LIST = 50;

/**
 * List files for a scope. `products` has no per-product file registry
 * column, so this reads the vault's own file-shaped artifacts (raw_file /
 * external_url) for that scope — the actual discoverable file surface
 * today. When a products row exists, its repo_path is surfaced for context.
 */
export async function listFilesForScope(scope: string): Promise<{
  available: boolean; source: string; total: number; items: FileEntry[]; repoPath?: string | null;
}> {
  const product = await getProductRow(scope);

  const rows = (await pool.query(
    `SELECT a.node_id, n.title, a.kind, a.path, a.source_system, a.content_hash, a.created_at
     FROM vault_artifacts a JOIN vault_nodes n ON n.id = a.node_id
     WHERE a.app_scope = $1 AND a.kind IN ('raw_file','external_url')
     ORDER BY a.created_at DESC LIMIT ${MAX_LIST}`,
    [scope]
  )).rows as Array<{ node_id: string; title: string; kind: string; path: string | null; source_system: string | null; content_hash: string | null; created_at: number }>;

  const total = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM vault_artifacts WHERE app_scope = $1 AND kind IN ('raw_file','external_url')`,
    [scope]
  )).rows[0] as { c: number };

  return {
    available: rows.length > 0,
    source: 'vault artifacts (raw_file/external_url) — products registry has no file-list column yet',
    total: total.c,
    repoPath: product?.repo_path ?? undefined,
    items: rows.map((r) => ({
      nodeId: r.node_id,
      title: r.title,
      kind: r.kind,
      path: r.path,
      sourceSystem: r.source_system,
      contentHash: r.content_hash,
      createdAt: r.created_at,
    })),
  };
}

export interface ServiceEntry {
  name: string;
  kind: string; // 'backend' | 'frontend' | 'declared' | node type when falling back to vault
  port?: number | string | null;
  raw?: unknown;
}

/**
 * List services for a scope. Prefers the `products` row's own `services`
 * jsonb (normalized whether it's an object-map or an array); when that's
 * empty, derives an entry from `backend`/`frontend` jsonb (the real, live
 * shape seen for e.g. ymc: {"port":5182,"service":"ymc-backend"}). Falls
 * back to a vault-schema heuristic (service-shaped declared node types) only
 * when there is no products row at all for the scope.
 */
export async function listServicesForScope(scope: string): Promise<{ available: boolean; source: string; items: ServiceEntry[] }> {
  const product = await getProductRow(scope);

  if (product) {
    const items: ServiceEntry[] = [];
    const svc = product.services;
    if (Array.isArray(svc)) {
      for (const entry of svc) {
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>;
          items.push({ name: String(e.name ?? e.service ?? 'service'), kind: 'declared', port: (e.port as number | string) ?? null, raw: e });
        }
      }
    } else if (svc && typeof svc === 'object' && Object.keys(svc).length > 0) {
      for (const [name, cfg] of Object.entries(svc as Record<string, unknown>)) {
        items.push({ name, kind: 'declared', port: (cfg as Record<string, unknown> | undefined)?.port as number | string | undefined ?? null, raw: cfg });
      }
    }

    if (items.length === 0) {
      // services jsonb is empty — fall back to the backend/frontend shape, which is real for every product.
      const be = product.backend as Record<string, unknown>;
      const fe = product.frontend as Record<string, unknown>;
      if (be && Object.keys(be).length) {
        items.push({ name: String(be.service ?? `${product.slug}-backend`), kind: 'backend', port: (be.port as number | string) ?? null, raw: be });
      }
      if (fe && Object.keys(fe).length) {
        items.push({ name: String(fe.service ?? `${product.slug}-frontend`), kind: 'frontend', port: (fe.port as number | string) ?? null, raw: fe });
      }
    }

    return {
      available: items.length > 0,
      source: items.length > 0
        ? 'products registry (services jsonb, or backend/frontend fallback when services is empty)'
        : 'products row found but services/backend/frontend are all empty for this scope',
      items,
    };
  }

  // No products row at all — fall back to vault nodes of a service-shaped declared type, if any.
  const schemaRow = (await pool.query(
    `SELECT node_types FROM vault_schemas WHERE app_scope = $1`,
    [scope]
  )).rows[0] as { node_types: Array<{ type: string }> } | undefined;

  const serviceTypes = (schemaRow?.node_types ?? [])
    .map((t) => t.type)
    .filter((t) => /service|surface|\bapp\b/i.test(t));

  if (serviceTypes.length === 0) {
    return { available: false, source: 'no products row for this scope and no service-shaped node_type declared in its vault schema', items: [] };
  }

  const rows = (await pool.query(
    `SELECT id, title, type FROM vault_nodes
     WHERE app_scope = $1 AND type = ANY($2) AND status = 'active'
     ORDER BY title LIMIT ${MAX_LIST}`,
    [scope, serviceTypes]
  )).rows as Array<{ id: string; title: string; type: string }>;

  return {
    available: rows.length > 0,
    source: `vault nodes of type [${serviceTypes.join(', ')}] (no products row for this scope)`,
    items: rows.map((r) => ({ name: r.title, kind: r.type })),
  };
}

export interface ToolEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
}

/**
 * List Porter tools (global — this tool takes no scope argument). Porter's
 * own `tools` table is the real global catalog (already backing the admin/
 * skills surfaces); a per-product `products.tools` jsonb array exists but is
 * scoped to one product at a time and empty by default, so it isn't a
 * substitute for a global listing here.
 */
export async function listPorterTools(): Promise<{ available: boolean; source: string; items: ToolEntry[] }> {
  const toolsTableAvailable = await tableExists('tools');
  if (!toolsTableAvailable) {
    return { available: false, source: 'Porter\'s global tools table does not exist', items: [] };
  }

  const rows = (await pool.query(
    `SELECT id, name, description, category, type FROM tools
     WHERE enabled = 1 AND visible = 1
     ORDER BY sort_order ASC, name ASC LIMIT ${MAX_LIST}`
  )).rows as ToolEntry[];

  return {
    available: rows.length > 0,
    source: "Porter's global tools table (products.tools is per-product and not yet populated as a substitute)",
    items: rows,
  };
}
