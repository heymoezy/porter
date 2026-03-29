/**
 * System Prompt Pipeline — constructs the initialization prompt per agent/gateway
 *
 * Prompt layers (in order):
 * 1. Agent Identity — from agent_templates.system_prompt or personas
 * 2. Agent Soul — from persona files on disk (SOUL.md, ROLE_CARD.md)
 * 3. Directives — workspace/project rules from directives table
 * 4. Memory Context — relevant concepts/notes
 * 5. Gateway Instructions — per-gateway behavioral tweaks
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { queryAll } from '../../db/pg-helpers.js';

// ── Types ─────────────────────────────────────────────

export interface PromptLayer {
  name: string;
  source: string;
  content: string;
  tokens_est: number;
}

export interface GatewayPromptProfile {
  gateway_type: string;
  gateway_name: string;
  system_prompt: string;
  layers: PromptLayer[];
  config_files: Array<{ name: string; path: string; content: string; exists: boolean }>;
  porter_system_prompt: string;
}

// ── Helpers ───────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function readFileSafe(path: string): string | null {
  try {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  } catch { /* */ }
  return null;
}

// ── Gateway config file locations ─────────────────────

const GATEWAY_CONFIG_FILES: Record<string, Array<{ name: string; path: string }>> = {
  ollama: [
    { name: 'Ollama Service', path: '/etc/systemd/system/ollama.service' },
  ],
  openclaw: [
    { name: 'openclaw.json', path: join(homedir(), '.openclaw', 'openclaw.json') },
    { name: 'SOUL.md', path: join(homedir(), '.openclaw', 'workspace', 'SOUL.md') },
    { name: 'IDENTITY.md', path: join(homedir(), '.openclaw', 'workspace', 'IDENTITY.md') },
    { name: 'AGENTS.md', path: join(homedir(), '.openclaw', 'workspace', 'AGENTS.md') },
    { name: 'USER.md', path: join(homedir(), '.openclaw', 'workspace', 'USER.md') },
    { name: 'TOOLS.md', path: join(homedir(), '.openclaw', 'workspace', 'TOOLS.md') },
    { name: 'HEARTBEAT.md', path: join(homedir(), '.openclaw', 'workspace', 'HEARTBEAT.md') },
    { name: 'BOOTSTRAP.md', path: join(homedir(), '.openclaw', 'workspace', 'BOOTSTRAP.md') },
    { name: 'models.json', path: join(homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json') },
    { name: 'paired.json', path: join(homedir(), '.openclaw', 'devices', 'paired.json') },
    { name: 'exec-approvals.json', path: join(homedir(), '.openclaw', 'exec-approvals.json') },
    { name: 'cron/jobs.json', path: join(homedir(), '.openclaw', 'cron', 'jobs.json') },
    { name: 'config-health.json', path: join(homedir(), '.openclaw', 'logs', 'config-health.json') },
  ],
  claude_cli: [
    { name: 'CLAUDE.md (global)', path: join(homedir(), 'CLAUDE.md') },
    { name: 'CLAUDE.md (porter)', path: join(homedir(), 'documents', 'porter', 'CLAUDE.md') },
    { name: 'CLAUDE.md (admin)', path: join(homedir(), 'documents', 'porter-admin', 'CLAUDE.md') },
  ],
  codex_cli: [
    { name: 'config.toml', path: join(homedir(), '.codex', 'config.toml') },
    { name: 'version.json', path: join(homedir(), '.codex', 'version.json') },
    { name: 'models_cache.json', path: join(homedir(), '.codex', 'models_cache.json') },
  ],
  gemini_cli: [
    { name: 'GEMINI.md', path: join(homedir(), '.gemini', 'GEMINI.md') },
    { name: 'settings.json', path: join(homedir(), '.gemini', 'settings.json') },
  ],
};

// ── Build prompt profile for a gateway ────────────────

const PORTER_GATEWAY_PROMPTS: Record<string, string> = {
  ollama: `You are Porter, an AI orchestration platform. Running on local Ollama (limited context). Be concise and direct.`,
  openclaw: `You are Porter, an AI orchestration platform. Dispatching through OpenClaw gateway. Be helpful and thorough.`,
  claude_cli: `You are Porter, an AI orchestration platform. Running through Claude. Use deep reasoning for complex analysis.`,
  codex_cli: `You are Porter, an AI orchestration platform. Running through Codex. Optimize for code generation and structured output.`,
  gemini_cli: `You are Porter, an AI orchestration platform. Running through Gemini. Leverage broad knowledge and multimodal capabilities.`,
};

export async function buildGatewayPromptProfile(gatewayType: string, gatewayName: string): Promise<GatewayPromptProfile> {
  const layers: PromptLayer[] = [];

  const porterPrompt = PORTER_GATEWAY_PROMPTS[gatewayType];
  if (porterPrompt) {
    layers.push({
      name: 'Porter System Prompt',
      source: 'per-gateway identity',
      content: porterPrompt,
      tokens_est: estimateTokens(porterPrompt),
    });
  }

  const directives = await queryAll<{ content: string; scope_type: string }>(
    `SELECT text AS content, scope_type FROM directives WHERE status = 'active' ORDER BY priority ASC LIMIT 20`
  ).catch(() => []);

  if (directives.length > 0) {
    const directiveText = directives.map(d => `[${d.scope_type}] ${d.content}`).join('\n');
    layers.push({
      name: 'Directives',
      source: 'directives table',
      content: directiveText,
      tokens_est: estimateTokens(directiveText),
    });
  }

  const systemPrompt = layers.map(l => l.content).join('\n\n---\n\n');

  const configDefs = GATEWAY_CONFIG_FILES[gatewayType] || [];
  const configFiles = configDefs.map(cf => {
    const content = readFileSafe(cf.path);
    return {
      name: cf.name,
      path: cf.path,
      content: content ?? '',
      exists: content !== null,
    };
  });

  return {
    gateway_type: gatewayType,
    gateway_name: gatewayName,
    system_prompt: systemPrompt,
    layers,
    config_files: configFiles,
    porter_system_prompt: porterPrompt || '',
  };
}

export async function buildAllGatewayPromptProfiles(): Promise<GatewayPromptProfile[]> {
  const gateways = await queryAll<{ type: string; name: string }>(
    `SELECT type, name FROM gateways WHERE enabled = 1 ORDER BY priority ASC`
  );

  const profiles: GatewayPromptProfile[] = [];
  for (const gw of gateways) {
    profiles.push(await buildGatewayPromptProfile(gw.type, gw.name));
  }
  return profiles;
}
