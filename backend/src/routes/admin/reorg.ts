/**
 * Admin Reorg API (#28) — read-only planning surface for the safe/reversible
 * repository reorg. Returns:
 *   - the generated ~/.claude.json mcpServers dry-run block + diff (never written)
 *   - the canonical-layout MOVE runbook (per-server config/unit edits + rollback)
 *   - the safe DEDUP report (reclaimable bytes; execute flag OFF)
 *
 * Everything here is READ-ONLY. No file is moved, deleted, or written; ~/.claude.json
 * is never touched. The dedup scan is opt-in (?dedup=1) because it walks ~/projects.
 */
import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { buildConfigGenPlan } from '../../services/reorg/mcp-registry.js';
import { buildMovePlan } from '../../services/reorg/layout-plan.js';
import { buildDedupReport } from '../../services/reorg/dedup-plan.js';

export default async function reorgRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/reorg/plan
  //   ?dedup=1        — also run the (heavier) duplicate-file scan of ~/projects
  //   ?dedupLimit=N   — cap dup sets returned (default 50)
  fastify.get('/plan', async (req) => {
    const q = (req.query ?? {}) as { dedup?: string; dedupLimit?: string };
    const runDedup = q.dedup === '1' || q.dedup === 'true';
    const limitSets = q.dedupLimit ? Math.max(1, parseInt(q.dedupLimit, 10) || 50) : 50;

    const configGen = buildConfigGenPlan();
    const move = buildMovePlan();
    const dedup = runDedup ? buildDedupReport({ limitSets }) : null;

    return ok({
      safety: {
        wroteClaudeJson: false,
        movedFiles: false,
        deletedFiles: false,
        note: 'Plan only. Nothing on disk was changed by this request.',
      },
      configGen: {
        targetFile: configGen.targetFile,
        wouldWrite: configGen.wouldWrite,
        changed: configGen.changed,
        currentUserBlock: configGen.currentUserBlock,
        proposedUserBlock: configGen.proposedUserBlock,
        diff: configGen.diff,
        registry: configGen.registry,
        note: configGen.note,
      },
      move,
      dedup: dedup ?? {
        skipped: true,
        reason: 'Pass ?dedup=1 to run the ~/projects duplicate scan (heavier).',
      },
    });
  });
}
