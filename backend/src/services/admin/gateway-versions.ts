/**
 * Gateway Version Service — detects running + latest versions at startup
 *
 * Replicates porter.py's version detection:
 * - Running version: CLI --version or HTTP API endpoint
 * - Latest version: npm view / GitHub releases API
 * - Persists to gateways.metadata.version + last_health_at
 * - Caches latest versions for 6 hours
 *
 * Runs once at startup, then on-demand via probeAllGateways().
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { queryAll } from '../../db/pg-helpers.js';
import { postIntelligence, assessUpdateRisk } from './agent-loop.js';

// ── Types ─────────────────────────────────────────────

export interface GatewayHookInfo {
  hooks_configured: boolean;
  hook_count: number;
}

export interface GatewayVersionInfo {
  gateway_id: string;
  gateway_name: string;
  gateway_type: string;
  version: string | null;
  latest: string | null;
  update_cmd: string | null;
  is_latest: boolean | null;
  latency_ms: number | null;
  healthy: boolean;
  hooks: GatewayHookInfo;
}

interface LatestCache {
  data: Record<string, { latest: string; update_cmd: string }>;
  ts: number;
}

// ── State ─────────────────────────────────────────────

let versionCache: GatewayVersionInfo[] = [];
const latestCache: LatestCache = { data: {}, ts: 0 };
const LATEST_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ── Helpers ───────────────────────────────────────────

function extractSemver(raw: string): string | null {
  const match = raw.match(/(\d+\.\d+[\.\d]*)/);
  return match ? match[1] : null;
}

function cliVersion(binaryPath: string): string | null {
  try {
    const out = execSync(`"${binaryPath}" --version 2>&1`, { timeout: 8000, encoding: 'utf8' });
    return extractSemver(out);
  } catch {
    return null;
  }
}

async function httpVersion(url: string, type: string): Promise<string | null> {
  try {
    const base = url.replace(/\/$/, '');
    if (type === 'ollama') {
      const resp = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const d = await resp.json() as { version?: string };
        return d.version ? extractSemver(d.version) ?? d.version : null;
      }
    } else if (type === 'openclaw') {
      const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const d = await resp.json() as Record<string, unknown>;
        const v = d.version ?? d.server_version ?? d.openclaw_version;
        if (typeof v === 'string') return extractSemver(v) ?? v;
      }
      return cliVersion('openclaw');
    }
  } catch { /* best-effort */ }
  return null;
}

function npmLatest(pkg: string): string | null {
  try {
    const out = execSync(`npm view ${pkg} version 2>/dev/null`, { timeout: 5000, encoding: 'utf8' });
    return extractSemver(out.trim());
  } catch {
    return null;
  }
}

async function githubLatestRelease(repo: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'porter-admin' },
    });
    if (resp.ok) {
      const d = await resp.json() as { tag_name?: string };
      return d.tag_name ? extractSemver(d.tag_name) : null;
    }
  } catch { /* best-effort */ }
  return null;
}

// ── Hook detection per gateway type ───────────────────

function detectHooks(gwType: string): GatewayHookInfo {
  const none: GatewayHookInfo = { hooks_configured: false, hook_count: 0 };
  try {
    if (gwType === 'claude_cli') {
      const settingsPath = join(homedir(), '.claude', 'settings.json');
      const data = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown[]> | undefined;
      if (!hooks) return none;
      let count = 0;
      for (const eventHooks of Object.values(hooks)) {
        if (Array.isArray(eventHooks)) {
          for (const group of eventHooks) {
            const g = group as { hooks?: unknown[] };
            if (Array.isArray(g.hooks)) count += g.hooks.length;
          }
        }
      }
      return { hooks_configured: count > 0, hook_count: count };
    }

    if (gwType === 'codex_cli') {
      const configPath = join(homedir(), '.codex', 'config.toml');
      const content = readFileSync(configPath, 'utf8');
      const matches = content.match(/^\[\[hooks\]\]/gm);
      const count = matches ? matches.length : 0;
      return { hooks_configured: count > 0, hook_count: count };
    }

    if (gwType === 'openclaw') {
      const agentsPath = join(homedir(), '.openclaw', 'workspace', 'AGENTS.md');
      readFileSync(agentsPath, 'utf8');
      return { hooks_configured: true, hook_count: 1 };
    }

    if (gwType === 'gemini_cli') {
      const settingsPath = join(homedir(), '.gemini', 'settings.json');
      const data = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const hooks = data.hooks as Record<string, unknown[]> | undefined;
      if (!hooks) return none;
      let count = 0;
      for (const eventHooks of Object.values(hooks)) {
        if (Array.isArray(eventHooks)) {
          for (const group of eventHooks) {
            const g = group as { hooks?: unknown[] };
            if (Array.isArray(g.hooks)) count += g.hooks.length;
          }
        }
      }
      return { hooks_configured: count > 0, hook_count: count };
    }

    return none;
  } catch {
    return none;
  }
}

// ── NPM package names per gateway type ────────────────

const NPM_PACKAGES: Record<string, string> = {
  claude_cli: '@anthropic-ai/claude-code',
  codex_cli: '@openai/codex',
  gemini_cli: '@google/gemini-cli',
  openclaw: 'openclaw',
};

// ── Core: probe all gateways ──────────────────────────

export async function probeAllGateways(): Promise<GatewayVersionInfo[]> {
  const rows = await queryAll<{
    id: string; type: string; name: string; url: string | null;
    metadata: Record<string, unknown>; status: string;
  }>('SELECT id, type, name, url, metadata, status FROM gateways WHERE enabled = 1 ORDER BY priority ASC');

  // Refresh latest versions if stale (6h TTL, like porter.py)
  const now = Date.now();
  if (now - latestCache.ts > LATEST_TTL) {
    const refreshed: typeof latestCache.data = {};

    // OpenClaw — check ~/.openclaw/update-check.json first (like porter.py)
    try {
      const ocFile = join(homedir(), '.openclaw', 'update-check.json');
      const ocData = JSON.parse(readFileSync(ocFile, 'utf8')) as { lastNotifiedVersion?: string };
      const ocLatest = ocData.lastNotifiedVersion ? extractSemver(ocData.lastNotifiedVersion) ?? ocData.lastNotifiedVersion : null;
      if (ocLatest) {
        refreshed['openclaw'] = { latest: ocLatest, update_cmd: 'npm uninstall -g openclaw && npm i -g openclaw' };
      }
    } catch { /* no update-check.json */ }

    // npm packages (skip openclaw if already got from file)
    for (const [gwType, pkg] of Object.entries(NPM_PACKAGES)) {
      if (refreshed[gwType]) continue;
      const latest = npmLatest(pkg);
      if (latest) {
        refreshed[gwType] = {
          latest,
          update_cmd: `npm i -g ${pkg}`,
        };
      }
    }

    // Ollama via GitHub releases
    const ollamaLatest = await githubLatestRelease('ollama/ollama');
    if (ollamaLatest) {
      refreshed['ollama'] = { latest: ollamaLatest, update_cmd: 'curl -fsSL https://ollama.com/install.sh | sh' };
    }

    latestCache.data = refreshed;
    latestCache.ts = now;
  }

  // Probe each gateway
  const results: GatewayVersionInfo[] = [];

  for (const gw of rows) {
    const meta = (typeof gw.metadata === 'object' && gw.metadata !== null ? gw.metadata : {}) as Record<string, unknown>;
    const binaryPath = meta.binary_path as string | undefined;
    const start = Date.now();
    let version: string | null = null;
    let healthy = false;

    try {
      if (gw.url) {
        const base = gw.url.replace(/\/$/, '');
        const healthUrl = base + (gw.type === 'ollama' ? '/api/tags' : '/health');
        await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        healthy = true;
        version = await httpVersion(gw.url, gw.type);
      }
      if (!version && binaryPath) {
        version = cliVersion(binaryPath);
      }
      if (!version && gw.type === 'openclaw') {
        try {
          const out = execSync('openclaw --version 2>&1', { timeout: 5000, encoding: 'utf8' });
          version = extractSemver(out);
        } catch { /* best-effort */ }
      }
      if (!gw.url && !healthy) {
        healthy = version !== null;
      }
    } catch {
      healthy = false;
    }

    const latency_ms = Date.now() - start;
    const latestInfo = latestCache.data[gw.type];
    const latest = latestInfo?.latest ?? null;
    const update_cmd = latestInfo?.update_cmd ?? null;
    const is_latest = version && latest ? version === latest : null;

    // Persist version + last_health_at to DB
    if (version) {
      await queryAll(
        `UPDATE gateways SET last_health_at = EXTRACT(EPOCH FROM NOW()), metadata = jsonb_set(COALESCE(metadata, '{}'), '{version}', to_jsonb($1::text)) WHERE id = $2`,
        [version, gw.id]
      );
    } else {
      await queryAll(
        `UPDATE gateways SET last_health_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
        [gw.id]
      );
    }

    // Post to Intelligence Feed when update is available
    if (is_latest === false && version && latest) {
      const existing = await queryAll<{ id: string }>(
        `SELECT id FROM intelligence_feed WHERE source_agent = 'bridge-operator' AND metadata->>'gateway_type' = $1 AND metadata->>'current_version' = $2 AND metadata->>'target_version' = $3 LIMIT 1`,
        [gw.type, version, latest]
      ).catch(() => []);

      if (existing.length === 0) {
        const risk = assessUpdateRisk(version, latest);
        postIntelligence({
          sourceAgent: 'bridge-operator',
          entryType: risk === 'high' ? 'blocker' : 'capability',
          title: `${gw.name}: update available ${version} → ${latest}`,
          body: risk === 'high'
            ? `Major version change detected for ${gw.name}. This may contain breaking changes. Review changelog before updating.\n\nUpdate command: ${update_cmd}`
            : `${gw.name} can be updated from ${version} to ${latest}.\n\nUpdate command: ${update_cmd}`,
          metadata: {
            risk_level: risk,
            action: 'gateway_update',
            gateway_type: gw.type,
            gateway_id: gw.id,
            current_version: version,
            target_version: latest,
            update_cmd,
            auto_acted: false,
          },
        }).catch(() => {});
      }
    }

    results.push({
      gateway_id: gw.id,
      gateway_name: gw.name,
      gateway_type: gw.type,
      version,
      latest,
      update_cmd,
      is_latest,
      latency_ms,
      healthy,
      hooks: detectHooks(gw.type),
    });
  }

  versionCache = results;
  return results;
}

/** Get cached version info (instant, no network) */
export function getCachedVersions(): GatewayVersionInfo[] {
  return versionCache;
}
