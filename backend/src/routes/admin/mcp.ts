/**
 * Admin MCP API — read-only view of the MCP servers Claude Code CLI knows
 * about on this machine (Porter "doubles as a config view for the Claude
 * Code CLI" — vault/concepts/porter-admin-revamp.md, New surface 1).
 *
 * Sources merged (all read directly off disk, no DB):
 *   - ~/.claude.json                 mcpServers (top-level)      → scope 'user'
 *   - ~/.claude.json                 projects[*].mcpServers      → scope 'project'
 *   - ~/.claude/settings.json        mcpServers (rare)           → scope 'user-settings'
 *   - ~/.claude/settings.local.json  mcpServers                  → scope 'local-settings'
 *   - <project>/.mcp.json            mcpServers                  → scope 'project-file'
 *
 * Claude Code's config format has no per-server enable/disable flag — presence
 * in one of these files IS the enabled state, so `enabled` is always true here.
 *
 * v1 is READ-ONLY by design: these are hand-edited, live-in-use config files
 * (~/.claude.json in particular carries a huge amount of unrelated CLI state).
 * Add/remove/health-probe writes are a follow-on release once the read model
 * has been in front of Moe (see porter-admin-revamp.md "New surface 1").
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';

const HOME = process.env.HOME || os.homedir();
const PROJECTS_ROOT = process.env.PORTER_PROJECTS_DIR || path.join(HOME, 'projects');

const CLAUDE_JSON_PATH = path.join(HOME, '.claude.json');
const SETTINGS_JSON_PATH = path.join(HOME, '.claude', 'settings.json');
const SETTINGS_LOCAL_JSON_PATH = path.join(HOME, '.claude', 'settings.local.json');

type McpScope = 'user' | 'project' | 'user-settings' | 'local-settings' | 'project-file';

interface RawMcpServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServerEntry {
  name: string;
  scope: McpScope;
  sourcePath: string;
  projectPath?: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
}

// Redact any env var / URL query param whose KEY looks secret-ish. Better to
// over-redact a harmless path (e.g. *_CREDENTIALS_PATH) than leak a real key.
const SECRET_KEY_PATTERN = /token|key|secret|pass|credential/i;
const REDACTED = '***redacted***';

function redactEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : v;
  }
  return out;
}

function redactUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SECRET_KEY_PATTERN.test(key)) u.searchParams.set(key, REDACTED);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function detectTransport(raw: RawMcpServer): McpServerEntry['transport'] {
  if (raw.type === 'http' || raw.type === 'sse') return raw.type;
  if (raw.command || raw.type === 'stdio') return 'stdio';
  if (raw.url) return 'http';
  return 'unknown';
}

function toEntry(
  name: string,
  raw: RawMcpServer,
  scope: McpScope,
  sourcePath: string,
  projectPath?: string,
): McpServerEntry {
  return {
    name,
    scope,
    sourcePath,
    projectPath,
    transport: detectTransport(raw),
    command: raw.command,
    args: raw.args,
    env: redactEnv(raw.env),
    url: redactUrl(raw.url),
    enabled: true,
  };
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Find `.mcp.json` at project root and one level of sub-project (Porter's
 *  flat + `<name>/<sub>` convention — see /home/lobster/projects/projects.md). */
function findProjectMcpFiles(root: string): string[] {
  const found: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(root, entry.name);
    const direct = path.join(dir, '.mcp.json');
    if (fs.existsSync(direct)) found.push(direct);
    let subEntries: fs.Dirent[];
    try {
      subEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
      const subMcp = path.join(dir, sub.name, '.mcp.json');
      if (fs.existsSync(subMcp)) found.push(subMcp);
    }
  }
  return found;
}

function collectServers(): McpServerEntry[] {
  const servers: McpServerEntry[] = [];

  // 1. ~/.claude.json — user-global mcpServers + per-project mcpServers
  const claudeJson = readJsonSafe(CLAUDE_JSON_PATH);
  if (claudeJson) {
    const userServers = claudeJson.mcpServers as Record<string, RawMcpServer> | undefined;
    if (userServers) {
      for (const [name, raw] of Object.entries(userServers)) {
        servers.push(toEntry(name, raw, 'user', CLAUDE_JSON_PATH));
      }
    }
    const projects = claudeJson.projects as Record<string, { mcpServers?: Record<string, RawMcpServer> }> | undefined;
    if (projects) {
      for (const [projectPath, projectConfig] of Object.entries(projects)) {
        const projectServers = projectConfig?.mcpServers;
        if (!projectServers) continue;
        for (const [name, raw] of Object.entries(projectServers)) {
          servers.push(toEntry(name, raw, 'project', `${CLAUDE_JSON_PATH} → projects["${projectPath}"]`, projectPath));
        }
      }
    }
  }

  // 2. ~/.claude/settings.json — rare, but part of the CLI's config surface
  const settingsJson = readJsonSafe(SETTINGS_JSON_PATH);
  const settingsJsonServers = settingsJson?.mcpServers as Record<string, RawMcpServer> | undefined;
  if (settingsJsonServers) {
    for (const [name, raw] of Object.entries(settingsJsonServers)) {
      servers.push(toEntry(name, raw, 'user-settings', SETTINGS_JSON_PATH));
    }
  }

  // 3. ~/.claude/settings.local.json — user-scope local overrides
  const settingsLocal = readJsonSafe(SETTINGS_LOCAL_JSON_PATH);
  const settingsLocalServers = settingsLocal?.mcpServers as Record<string, RawMcpServer> | undefined;
  if (settingsLocalServers) {
    for (const [name, raw] of Object.entries(settingsLocalServers)) {
      servers.push(toEntry(name, raw, 'local-settings', SETTINGS_LOCAL_JSON_PATH));
    }
  }

  // 4. project-level .mcp.json files under the projects root
  for (const mcpFile of findProjectMcpFiles(PROJECTS_ROOT)) {
    const parsed = readJsonSafe(mcpFile);
    const projectServers = parsed?.mcpServers as Record<string, RawMcpServer> | undefined;
    if (!projectServers) continue;
    const projectPath = path.dirname(mcpFile);
    for (const [name, raw] of Object.entries(projectServers)) {
      servers.push(toEntry(name, raw, 'project-file', mcpFile, projectPath));
    }
  }

  return servers;
}

export default async function mcpRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/mcp — merged, redacted view of every MCP server Claude
  // Code CLI is configured with on this machine, across all known scopes.
  fastify.get('/', async () => {
    const servers = collectServers();
    const byScope: Record<string, number> = {};
    for (const s of servers) byScope[s.scope] = (byScope[s.scope] || 0) + 1;

    return ok({
      servers,
      count: servers.length,
      byScope,
      sources: {
        claudeJson: CLAUDE_JSON_PATH,
        settingsJson: SETTINGS_JSON_PATH,
        settingsLocalJson: SETTINGS_LOCAL_JSON_PATH,
        projectsRoot: PROJECTS_ROOT,
      },
    });
  });
}
