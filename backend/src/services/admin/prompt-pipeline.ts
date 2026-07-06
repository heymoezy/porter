/**
 * System Prompt Pipeline — constructs the initialization prompt per agent/gateway
 *
 * Prompt layers (in order):
 * 1. Agent Identity — from agent_templates.system_prompt or personas
 * 2. Agent Soul — from persona files on disk (SOUL.md, ROLE_CARD.md)
 * 3. Directives — workspace/project rules from directives table
 * 4. Memory Context — relevant concepts/notes
 * 5. Gateway Instructions — per-gateway behavioral tweaks
 *
 * NOTE: Bridge consolidation (v6.9.0) collapsed to a single backend (claude_cli).
 * Stale ollama/openclaw/codex_cli/gemini_cli probes were removed in v6.0.1.
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
  claude_cli: [
    { name: 'CLAUDE.md (global)', path: join(homedir(), 'CLAUDE.md') },
  ],
};

// ── Build prompt profile for a gateway ────────────────

const PORTER_GATEWAY_PROMPTS: Record<string, string> = {
  claude_cli: `You are Porter, an AI orchestration platform. Running through Claude. Use deep reasoning for complex analysis.`,
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
