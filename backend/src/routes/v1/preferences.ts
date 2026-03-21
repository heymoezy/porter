import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import fs from 'fs';
import path from 'path';

// Allowed preference keys — matches porter.py's whitelist exactly
const ALLOWED_KEYS = new Set([
  'onboarding_complete', 'default_location', 'checkpoint_interval',
  'lease_ttl', 'auto_resume', 'show_hidden', 'density', 'editor_font_size',
  'policy_preset', 'setup_profile', 'skills_routing', 'memory_mode',
  'behavior_preset', 'memory_visibility', 'usage_warn_threshold',
  'skills_safe_mode', 'external_send_approval', 'preferred_model',
  'context_compression', 'fallback_chain', 'timezone',
  'model_rankings', 'routing_mode',
  'auto_manage_memory', 'recall_last_read',
]);

function readConfig(): Record<string, any> {
  try {
    const cfgPath = path.join(config.dataDir, 'porter_config.json');
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg: Record<string, any>): void {
  const cfgPath = path.join(config.dataDir, 'porter_config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

export default async function preferencesV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/preferences — return user preferences
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (_request, reply) => {
    const cfg = readConfig();
    const prefs = cfg.preferences || {};
    return reply.send(ok({ preferences: prefs }));
  });

  // POST /api/v1/preferences — update preferences (whitelist-filtered)
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send(err('INVALID_INPUT', 'Request body must be a JSON object'));
    }

    const cfg = readConfig();
    const prefs: Record<string, unknown> = cfg.preferences || {};

    let changed = false;
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_KEYS.has(key)) {
        prefs[key] = value;
        changed = true;
      }
    }

    if (changed) {
      cfg.preferences = prefs;
      writeConfig(cfg);
    }

    return reply.send(ok({ preferences: prefs }));
  });
}
