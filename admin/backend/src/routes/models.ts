import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { config } from '../config.js';
import { sqlite } from '../db/client.js';
import fs from 'fs';

async function probe(url: string, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number; data?: unknown }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    let data: unknown;
    try { data = await res.json(); } catch { /* not json */ }
    return { ok: res.ok, latencyMs: Date.now() - start, data };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// Simple cost-per-token estimates (USD per 1M tokens)
const COST_PER_M: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'gpt-5.4': { input: 5, output: 15 },
  'openai-codex/gpt-5.4': { input: 5, output: 15 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'qwen2.5-coder:1.5b': { input: 0, output: 0 },
  'qwen2.5-coder:7b-instruct-q4_K_M': { input: 0, output: 0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M[model] || { input: 2, output: 8 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export default async function modelsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/models — probe all backends, return health/version/latency
  fastify.get('/', async () => {
    const [porterPy, fastifyBackend, ollama, openclaw] = await Promise.all([
      probe(`${config.porterPyUrl}/api/admin/health`),
      probe(`${config.fastifyUrl}/health`),
      probe(`${config.ollamaUrl}/api/tags`),
      probe(`${config.openclawUrl}/health`),
    ]);

    // Extract Ollama models
    let ollamaModels: string[] = [];
    if (ollama.ok && ollama.data && typeof ollama.data === 'object') {
      const d = ollama.data as { models?: Array<{ name: string }> };
      ollamaModels = (d.models || []).map(m => m.name);
    }

    // Read porter_config for active models + backend_config
    let activeModels: Record<string, string> = {};
    let backendConfig: Record<string, unknown> = {};
    try {
      const cfgPath = `${config.dataDir}/porter_config.json`;
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(raw);
      activeModels = cfg?.preferences?.active_models || {};
      backendConfig = cfg?.backend_config || {};
    } catch { /* config not found */ }

    const gateways = [
      {
        name: 'Porter.py',
        type: 'product-backend',
        url: config.porterPyUrl,
        status: porterPy.ok ? 'healthy' : 'down',
        latencyMs: porterPy.latencyMs,
        version: porterPy.ok && porterPy.data && typeof porterPy.data === 'object' ? (porterPy.data as Record<string, unknown>).porter_version || null : null,
      },
      {
        name: 'Fastify Backend',
        type: 'api-server',
        url: config.fastifyUrl,
        status: fastifyBackend.ok ? 'healthy' : 'down',
        latencyMs: fastifyBackend.latencyMs,
        version: null,
      },
      {
        name: 'OpenClaw',
        type: 'ai-gateway',
        url: config.openclawUrl,
        status: openclaw.ok ? 'healthy' : 'down',
        latencyMs: openclaw.latencyMs,
        model: activeModels.openclaw || activeModels.codex || null,
        version: null,
      },
      {
        name: 'Ollama',
        type: 'local-inference',
        url: config.ollamaUrl,
        status: ollama.ok ? 'healthy' : 'down',
        latencyMs: ollama.latencyMs,
        models: ollamaModels,
        activeModel: activeModels.ollama || null,
      },
      {
        name: 'Gemini',
        type: 'cloud-api',
        url: 'gemini CLI',
        status: 'configured',
        latencyMs: 0,
        model: activeModels.gemini || null,
      },
    ];

    // DB health
    let dbInfo = { size: 0, walSize: 0, tables: 0 };
    try {
      const stat = fs.statSync(config.dbPath);
      dbInfo.size = stat.size;
      try { dbInfo.walSize = fs.statSync(config.dbPath + '-wal').size; } catch {}
      const tables = sqlite.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get() as { c: number };
      dbInfo.tables = tables.c;
    } catch {}

    return ok({ gateways, activeModels, backendConfig, db: dbInfo });
  });

  // GET /api/admin/models/usage — token usage aggregated by model
  fastify.get('/usage', async () => {
    try {
      const rows = sqlite.prepare(`
        SELECT model,
               sum(input_tokens) as input_tokens,
               sum(output_tokens) as output_tokens,
               sum(request_count) as requests,
               date as date
        FROM token_usage_daily
        GROUP BY model
        ORDER BY sum(input_tokens) + sum(output_tokens) DESC
      `).all() as Array<{ model: string; input_tokens: number; output_tokens: number; requests: number }>;

      const usage = rows.map(r => ({
        model: r.model,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        requests: r.requests,
        cost: estimateCost(r.model, r.input_tokens, r.output_tokens),
      }));

      const totalCost = usage.reduce((s, u) => s + u.cost, 0);
      const totalTokens = usage.reduce((s, u) => s + u.inputTokens + u.outputTokens, 0);
      const totalRequests = usage.reduce((s, u) => s + u.requests, 0);

      return ok({ usage, totalCost, totalTokens, totalRequests });
    } catch (e) {
      return ok({ usage: [], totalCost: 0, totalTokens: 0, totalRequests: 0 });
    }
  });

  // GET /api/admin/models/config — read porter_config backend section
  fastify.get('/config', async () => {
    try {
      const cfgPath = `${config.dataDir}/porter_config.json`;
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(raw);
      return ok({
        activeModels: cfg?.preferences?.active_models || {},
        backendConfig: cfg?.backend_config || {},
      });
    } catch {
      return ok({ activeModels: {}, backendConfig: {} });
    }
  });

  // GET /api/admin/models/flags — feature flags from config
  fastify.get('/flags', async () => {
    try {
      const cfgPath = `${config.dataDir}/porter_config.json`;
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(raw);
      const prefs = cfg?.preferences || {};
      const flags: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prefs)) {
        if (typeof v === 'boolean') flags[k] = v as boolean;
      }
      return ok({ flags });
    } catch {
      return ok({ flags: {} });
    }
  });
}
