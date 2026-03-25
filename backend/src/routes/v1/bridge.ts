import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { detectAndUpsertGateways } from '../../services/bridge/startup-detector.js';

// ── Row mappers ───────────────────────────────────────────────────────────────

/**
 * Strips raw DB row down to safe gateway fields.
 * encrypted_value is NEVER included — only masked_display is exposed.
 */
function maskGatewayRow(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    url: row.url,
    auth_method: row.auth_method,
    status: row.status,
    source: row.source,
    priority: row.priority,
    capabilities: row.capabilities ?? [],
    metadata: row.metadata ?? {},
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_health_at: row.last_health_at ?? null,
  };
}

/**
 * Returns credential row WITHOUT encrypted_value.
 * Only masked_display is exposed — this is the core security guarantee of GW-07.
 */
function maskCredentialRow(row: any) {
  return {
    id: row.id,
    gateway_id: row.gateway_id,
    label: row.label,
    masked_display: row.masked_display || '',
    created_at: row.created_at,
    rotated_at: row.rotated_at ?? null,
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function bridgeV1Routes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // ── GET /gateways — list all gateways with masked credentials ────────────────
  fastify.get('/gateways', {
    preHandler: [fastify.requireAuth],
  }, async (_request, reply) => {
    const { rows: gatewayRows } = await pool.query(
      'SELECT * FROM gateways ORDER BY priority ASC, created_at ASC',
    );

    const gateways = await Promise.all(
      gatewayRows.map(async (gw: any) => {
        const { rows: credRows } = await pool.query(
          'SELECT * FROM gateway_credentials WHERE gateway_id = $1 ORDER BY label ASC',
          [gw.id],
        );
        return {
          ...maskGatewayRow(gw),
          credentials: credRows.map(maskCredentialRow),
        };
      }),
    );

    return reply.send(ok({ gateways }));
  });

  // ── POST /redetect — admin-only re-scan of available gateways ────────────────
  fastify.post('/redetect', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }

    // Delete auto-detected + env-bootstrapped rows (cascade removes their credentials).
    // Manual entries are preserved.
    await pool.query(
      `DELETE FROM gateways WHERE source IN ('auto_detected', 'env_bootstrap')`,
    );

    // Re-run full detection + env bootstrap
    await detectAndUpsertGateways(pool);

    // Return fresh state
    const { rows: gatewayRows } = await pool.query(
      'SELECT * FROM gateways ORDER BY priority ASC, created_at ASC',
    );

    const gateways = await Promise.all(
      gatewayRows.map(async (gw: any) => {
        const { rows: credRows } = await pool.query(
          'SELECT * FROM gateway_credentials WHERE gateway_id = $1 ORDER BY label ASC',
          [gw.id],
        );
        return {
          ...maskGatewayRow(gw),
          credentials: credRows.map(maskCredentialRow),
        };
      }),
    );

    return reply.send(ok({ gateways, redetected: true }));
  });
}
