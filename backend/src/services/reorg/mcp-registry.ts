/**
 * Reorg #28 — MCP-server canonical registry + ~/.claude.json config generator.
 *
 * PROBLEM (from the read-only reorg audit): MCP servers are scattered —
 * gmail-mcp-ymc lives in ~/projects/, gmail-multi in ~/mcp-servers/, ymc-tom-mcp
 * in ymc.capital/services/, and package-based ones (gmail-themozaic, firecrawl)
 * are spawned via npx. ~/.claude.json is HAND-EDITED and carries absolute paths,
 * so "just move the directory" silently breaks the CLI.
 *
 * MECHANISM: hold a canonical registry (name → product → canonical target path →
 * command/args/env), SEEDED from the current on-disk config, and GENERATE the
 * ~/.claude.json `mcpServers` block from it. Moving a server then becomes safe:
 *   1. update the registry's canonical path,
 *   2. regenerate the config (this module) — dry-run diff first,
 *   3. move the dir, 4. write the regenerated config.
 *
 * This module is READ-ONLY / PURE: it never writes ~/.claude.json. The generator
 * returns the object it WOULD write plus a diff; a human/operator applies it.
 *
 * Additive, no DB, no schema. Seeds itself off disk on every call so it never
 * drifts from the live config.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const HOME = process.env.HOME || os.homedir();
const CLAUDE_JSON = path.join(HOME, '.claude.json');
const SETTINGS_LOCAL = path.join(HOME, '.claude', 'settings.local.json');
const PORTER_MCP_ROOT = path.join(HOME, 'porter', 'mcp'); // canonical destination root

export type McpKind = 'local-dir' | 'package';
export type McpScope = 'user' | 'project' | 'local-settings';

export interface RawMcpServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

/**
 * Known metadata that cannot be inferred from the raw config alone: the product
 * a server belongs to, whether it is a movable local directory or an npx package,
 * and (for local-dir) the CURRENT directory root that holds the server. Everything
 * else (command/args/env/scope/source) is read live off disk so this never drifts.
 *
 * `ymc-tom-mcp` is listed even though it is NOT in ~/.claude.json — it is an MCP
 * server the audit found scattered under ymc.capital/services and consumed by Tom
 * (backend/src/lib/tom-worker-registry.ts + tom-run-worker.ts). The registry tracks
 * it so its move gets a runbook too; it is flagged `registered:false` so the
 * user-block generator ignores it (it is not a CLI mcpServers entry).
 */
interface KnownMeta {
  product: string;
  kind: McpKind;
  /** current directory root (local-dir only) */
  root?: string;
  /** consumers that carry an absolute reference to this server's path */
  consumers?: string[];
  /** present in ~/.claude.json / settings — false = tracked-but-unregistered */
  cliRegistered: boolean;
}

const KNOWN: Record<string, KnownMeta> = {
  'gmail-themozaic': { product: 'themozaic', kind: 'package', cliRegistered: true },
  'gmail-ymc': {
    product: 'ymc',
    kind: 'local-dir',
    root: path.join(HOME, 'projects', 'gmail-mcp-ymc'),
    cliRegistered: true,
  },
  'gmail-multi': {
    product: 'shared',
    kind: 'local-dir',
    root: path.join(HOME, 'mcp-servers', 'gmail-multi-inbox-mcp'),
    cliRegistered: true,
  },
  firecrawl: { product: 'shared', kind: 'package', cliRegistered: true },
  'ymc-tom-mcp': {
    product: 'ymc',
    kind: 'local-dir',
    root: path.join(HOME, 'projects', 'ymc.capital', 'services', 'ymc-tom-mcp'),
    consumers: [
      path.join(HOME, 'projects', 'ymc.capital', 'backend', 'src', 'lib', 'tom-worker-registry.ts'),
      path.join(HOME, 'projects', 'ymc.capital', 'backend', 'src', 'lib', 'tom-run-worker.ts'),
    ],
    cliRegistered: false,
  },
};

export interface McpRegistryEntry {
  name: string;
  product: string;
  kind: McpKind;
  scope: McpScope | 'unregistered';
  /** file (+ json pointer) the server is currently registered in */
  sourceRef: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** current on-disk directory (local-dir only) */
  currentDir?: string;
  /** canonical destination under ~/porter/mcp/<product>/<server> (local-dir only) */
  canonicalDir?: string;
  cliRegistered: boolean;
  /** absolute references elsewhere that must be updated on move */
  consumers?: string[];
  /** true = registry can point config here without a directory move */
  needsMove: boolean;
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function canonicalFor(meta: KnownMeta): string | undefined {
  if (meta.kind !== 'local-dir' || !meta.root) return undefined;
  return path.join(PORTER_MCP_ROOT, meta.product, path.basename(meta.root));
}

/** Discover the raw current config across the CLI's config surfaces. */
interface Discovered {
  name: string;
  raw: RawMcpServer;
  scope: McpScope;
  sourceRef: string;
}
export function discoverCurrentMcp(): Discovered[] {
  const out: Discovered[] = [];
  const cj = readJson(CLAUDE_JSON);
  if (cj) {
    const user = cj.mcpServers as Record<string, RawMcpServer> | undefined;
    if (user) for (const [name, raw] of Object.entries(user)) {
      out.push({ name, raw, scope: 'user', sourceRef: `${CLAUDE_JSON} → mcpServers` });
    }
    const projects = cj.projects as Record<string, { mcpServers?: Record<string, RawMcpServer> }> | undefined;
    if (projects) for (const [projPath, cfg] of Object.entries(projects)) {
      if (!cfg?.mcpServers) continue;
      for (const [name, raw] of Object.entries(cfg.mcpServers)) {
        out.push({ name, raw, scope: 'project', sourceRef: `${CLAUDE_JSON} → projects["${projPath}"].mcpServers` });
      }
    }
  }
  const sl = readJson(SETTINGS_LOCAL);
  const slServers = sl?.mcpServers as Record<string, RawMcpServer> | undefined;
  if (slServers) for (const [name, raw] of Object.entries(slServers)) {
    out.push({ name, raw, scope: 'local-settings', sourceRef: `${SETTINGS_LOCAL} → mcpServers` });
  }
  return out;
}

/** Build the merged registry: KNOWN metadata + live command/args/env from disk. */
export function buildRegistry(): McpRegistryEntry[] {
  const discovered = discoverCurrentMcp();
  const byName = new Map(discovered.map((d) => [d.name, d]));
  const entries: McpRegistryEntry[] = [];

  for (const [name, meta] of Object.entries(KNOWN)) {
    const d = byName.get(name);
    const canonicalDir = canonicalFor(meta);
    const needsMove =
      meta.kind === 'local-dir' && !!meta.root && !!canonicalDir && meta.root !== canonicalDir;
    entries.push({
      name,
      product: meta.product,
      kind: meta.kind,
      scope: d ? d.scope : 'unregistered',
      sourceRef: d ? d.sourceRef : '(not in CLI config — consumed directly)',
      command: d?.raw.command,
      args: d?.raw.args,
      env: d?.raw.env,
      currentDir: meta.root,
      canonicalDir,
      cliRegistered: meta.cliRegistered,
      consumers: meta.consumers,
      needsMove,
    });
  }

  // Surface any live server we don't have KNOWN metadata for, so nothing is lost.
  for (const d of discovered) {
    if (KNOWN[d.name]) continue;
    entries.push({
      name: d.name,
      product: 'unknown',
      kind: d.raw.command === 'npx' ? 'package' : 'local-dir',
      scope: d.scope,
      sourceRef: d.sourceRef,
      command: d.raw.command,
      args: d.raw.args,
      env: d.raw.env,
      cliRegistered: true,
      needsMove: false,
    });
  }
  return entries;
}

/** Rewrite an absolute arg that lives under `fromDir` to live under `toDir`. */
function rewriteArg(arg: string, fromDir: string, toDir: string): string {
  if (arg === fromDir) return toDir;
  const withSep = fromDir.endsWith(path.sep) ? fromDir : fromDir + path.sep;
  if (arg.startsWith(withSep)) return path.join(toDir, arg.slice(withSep.length));
  return arg;
}

/**
 * Generate the user-scope `mcpServers` block for ~/.claude.json from the registry.
 *   mode='current'   — re-emit at current paths (must equal the live block)
 *   mode='canonical' — emit with local-dir args rewritten to ~/porter/mcp/...
 *
 * Only USER-scope, cliRegistered, local-dir/package servers appear here — that is
 * exactly the ~/.claude.json top-level `mcpServers` block. project-scope
 * (gmail-multi) and local-settings (firecrawl) servers live in OTHER config
 * surfaces and are handled by the move runbook's per-server config-edit steps.
 */
export function generateUserMcpBlock(
  registry: McpRegistryEntry[],
  mode: 'current' | 'canonical',
): Record<string, RawMcpServer> {
  const block: Record<string, RawMcpServer> = {};
  for (const e of registry) {
    if (e.scope !== 'user' || !e.cliRegistered) continue;
    const server: RawMcpServer = { type: 'stdio' };
    if (e.command) server.command = e.command;
    let args = e.args ? [...e.args] : undefined;
    if (mode === 'canonical' && e.kind === 'local-dir' && e.currentDir && e.canonicalDir && args) {
      args = args.map((a) => rewriteArg(a, e.currentDir!, e.canonicalDir!));
    }
    if (args) server.args = args;
    if (e.env) server.env = e.env;
    block[e.name] = server;
  }
  return block;
}

/** Read the live top-level mcpServers block verbatim (for diffing). */
export function readLiveUserMcpBlock(): Record<string, RawMcpServer> {
  const cj = readJson(CLAUDE_JSON);
  return (cj?.mcpServers as Record<string, RawMcpServer>) ?? {};
}

// ---- minimal LCS line diff (no deps) -------------------------------------
export interface DiffLine {
  op: ' ' | '+' | '-';
  text: string;
}
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ op: ' ', text: A[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ op: '-', text: A[i] }); i++; }
    else { out.push({ op: '+', text: B[j] }); j++; }
  }
  while (i < n) { out.push({ op: '-', text: A[i] }); i++; }
  while (j < m) { out.push({ op: '+', text: B[j] }); j++; }
  return out;
}

const SECRET_KEY = /token|key|secret|pass|credential/i;
function redactBlock(block: Record<string, RawMcpServer>): Record<string, RawMcpServer> {
  const out: Record<string, RawMcpServer> = {};
  for (const [name, s] of Object.entries(block)) {
    const env = s.env
      ? Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, SECRET_KEY.test(k) ? '***redacted***' : v]))
      : undefined;
    out[name] = { ...s, ...(env ? { env } : {}) };
  }
  return out;
}

export interface ConfigGenPlan {
  targetFile: string;
  wouldWrite: false;
  registry: McpRegistryEntry[];
  currentUserBlock: Record<string, RawMcpServer>;
  proposedUserBlock: Record<string, RawMcpServer>;
  diff: DiffLine[];
  changed: boolean;
  note: string;
}

/**
 * The dry-run: what the ~/.claude.json mcpServers block WOULD become once the
 * registry's canonical paths are applied, plus a line diff vs the live block.
 * DOES NOT WRITE. Values are redacted for display only; the real generator would
 * write unredacted `env`.
 */
export function buildConfigGenPlan(): ConfigGenPlan {
  const registry = buildRegistry();
  const currentLive = readLiveUserMcpBlock();
  const proposed = generateUserMcpBlock(registry, 'canonical');
  const currentStr = JSON.stringify(redactBlock(currentLive), null, 2);
  const proposedStr = JSON.stringify(redactBlock(proposed), null, 2);
  const diff = diffLines(currentStr, proposedStr);
  return {
    targetFile: CLAUDE_JSON,
    wouldWrite: false,
    registry,
    currentUserBlock: redactBlock(currentLive),
    proposedUserBlock: redactBlock(proposed),
    diff,
    changed: currentStr !== proposedStr,
    note:
      'DRY-RUN ONLY — ~/.claude.json is never written. Apply order per server: ' +
      '(1) move the directory, (2) regenerate + write this block. Regenerating BEFORE ' +
      'the move would point the CLI at a non-existent path.',
  };
}
