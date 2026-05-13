// backend/src/routes/admin/dreams.ts
// Phase 48.4 Review Surface — admin endpoints for memory_proposals review.
//
// All routes guarded by requirePlatformAdmin (mirrors evolution.ts shape).
// Accept handler is a single PostgreSQL transaction with FOR UPDATE row locks
// + post-commit SSE broadcast (NEVER broadcast inside the transaction — Pitfall 1).
// Reject handler is symmetric atomicity (BEGIN/COMMIT/ROLLBACK on a single client).
//
// Reviewer username pulled via request.sessionUser?.username (admin-auth.ts:37) —
// matches admin/intelligence.ts:145 precedent. Falls back to literal 'admin'.

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';
import { pool } from '../../db/client.js';
import { broadcast } from '../../services/sse-hub.js';

// Raw row shapes — pg returns snake_case column names (Drizzle's $inferSelect
// camelCase mapping only applies when using the Drizzle ORM query builder).
// These match memory_proposals / dream_runs / directives table columns verbatim.
interface MemoryProposalRow {
  id: string;
  dream_run_id: string;
  silo_id: string;
  proposal_kind: string;
  target_directive_ids: string[];
  proposed_content: string;
  proposed_metadata: Record<string, unknown>;
  source_evidence: Record<string, unknown>;
  sort_order: number;
  status: string;
  created_at: number;
  expires_at: number | null;
  reviewed_at: number | null;
  reviewed_by: string | null;
}

interface DreamRunRow {
  id: string;
  silo_id: string;
  status: string;
  model_used: string | null;
  triggered_by: string | null;
  triggered_by_user: string | null;
  action_config: Record<string, unknown> | null;
  prompt_token_estimate: number | null;
  response_token_estimate: number | null;
  turns_sampled: number | null;
  sessions_sampled: number | null;
  proposals_extracted: number | null;
  duration_ms: number | null;
  error_message: string | null;
  dispatch_id: string | null;
  started_at: number;
  completed_at: number | null;
}

interface DirectiveRow {
  id: string;
  scope: string;
  scope_id: string;
  content: string;
  priority: number;
  source_type: string;
  status: string;
}

export default async function dreamsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/dreams/proposals
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/proposals', async (req) => {
    const q = req.query as {
      silo_id?: string;
      status?: string;
      dream_run_id?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.silo_id) { conditions.push(`silo_id = $${idx++}`); params.push(q.silo_id); }
    if (q.status)  { conditions.push(`status = $${idx++}`);  params.push(q.status); }
    if (q.dream_run_id) { conditions.push(`dream_run_id = $${idx++}`); params.push(q.dream_run_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Page rows (uses memory_proposals_silo_status_created_idx)
    const proposals = await queryAll<MemoryProposalRow>(
      `SELECT * FROM memory_proposals ${where}
       ORDER BY created_at DESC, sort_order ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    // Total matching (same filters)
    const totalRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM memory_proposals ${where}`,
      params,
    );
    const total = parseInt(totalRow?.total ?? '0', 10);

    // counts_by_status (silo-scoped if silo filter present; otherwise global)
    const statusFilter = q.silo_id ? 'WHERE silo_id = $1' : '';
    const statusParams = q.silo_id ? [q.silo_id] : [];
    const countsRows = await queryAll<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM memory_proposals ${statusFilter} GROUP BY status`,
      statusParams,
    );
    const counts_by_status: Record<string, number> = { pending: 0, accepted: 0, rejected: 0, expired: 0 };
    for (const r of countsRows) counts_by_status[r.status] = parseInt(r.n, 10);

    return ok({ proposals, count: proposals.length, total, counts_by_status });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/admin/dreams/proposals/:id/accept — transactional 4-kind matrix
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/proposals/:id/accept', async (req, reply) => {
    const { id: proposalId } = req.params as { id: string };
    const reviewer = req.sessionUser?.username ?? 'admin';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Re-read proposal under row lock
      const propRes = await client.query<MemoryProposalRow>(
        `SELECT * FROM memory_proposals WHERE id = $1 FOR UPDATE`,
        [proposalId],
      );
      if (propRes.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return err('NOT_FOUND', 'Proposal not found');
      }
      const proposal = propRes.rows[0];
      if (proposal.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return err('INVALID_STATE', `Cannot accept proposal with status '${proposal.status}'`);
      }

      // 2. Re-read targets under row lock (zero-or-more)
      let targets: DirectiveRow[] = [];
      const targetIds: string[] = proposal.target_directive_ids ?? [];
      if (targetIds.length > 0) {
        const tres = await client.query<DirectiveRow>(
          `SELECT id, scope, scope_id, content, priority, source_type, status
           FROM directives WHERE id = ANY($1::text[]) FOR UPDATE`,
          [targetIds],
        );
        if ((tres.rowCount ?? 0) !== targetIds.length) {
          await client.query('ROLLBACK');
          reply.code(410);
          return err('TARGET_GONE', 'One or more target directives no longer exist');
        }
        targets = tres.rows;

        // 2a. Pre-flight: silo mismatch
        for (const t of targets) {
          if (t.scope !== 'silo' || t.scope_id !== proposal.silo_id) {
            await client.query('ROLLBACK');
            reply.code(422);
            return err('SILO_MISMATCH', `Target ${t.id} is scope='${t.scope}' scope_id='${t.scope_id}' but proposal silo_id='${proposal.silo_id}'`);
          }
        }

        // 2b. Pre-flight: sealed seed (catches before the trigger fires)
        if (proposal.proposal_kind !== 'new_directive') {
          for (const t of targets) {
            if (t.source_type === 'moe-direct') {
              await client.query('ROLLBACK');
              reply.code(422);
              return err('SEALED_SEED', `Target ${t.id} is a sealed seed directive (source_type='moe-direct'); cannot ${proposal.proposal_kind}`);
            }
          }
        }
      }

      // 3. Kind-specific mutation
      const touched: string[] = [];
      const metadata = proposal.proposed_metadata ?? {};
      const proposedPriority = typeof metadata.priority === 'number' ? metadata.priority : 50;

      if (proposal.proposal_kind === 'new_directive') {
        const newId = 'd_' + randomUUID();
        await client.query(
          `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
           VALUES ($1, 'silo', $2, $3, $4, 'dream_worker', 'active', $5,
                   EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
          [newId, proposal.silo_id, proposal.proposed_content, proposedPriority, reviewer],
        );
        touched.push(newId);

      } else if (proposal.proposal_kind === 'supersede') {
        // Exactly one target
        const t = targets[0];
        await client.query(
          `UPDATE directives
             SET content = $1,
                 priority = $2,
                 updated_at = EXTRACT(EPOCH FROM NOW())
           WHERE id = $3`,
          [proposal.proposed_content, proposedPriority, t.id],
        );
        touched.push(t.id);

      } else if (proposal.proposal_kind === 'merge') {
        // INSERT new combined directive
        const newId = 'd_' + randomUUID();
        await client.query(
          `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
           VALUES ($1, 'silo', $2, $3, $4, 'dream_worker', 'active', $5,
                   EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
          [newId, proposal.silo_id, proposal.proposed_content, proposedPriority, reviewer],
        );
        touched.push(newId);
        // Archive all targets
        for (const t of targets) {
          await client.query(
            `UPDATE directives SET status='archived', updated_at=EXTRACT(EPOCH FROM NOW()) WHERE id=$1`,
            [t.id],
          );
          touched.push(t.id);
        }

      } else if (proposal.proposal_kind === 'delete') {
        // Soft-delete via status='archived'
        const t = targets[0];
        await client.query(
          `UPDATE directives SET status='archived', updated_at=EXTRACT(EPOCH FROM NOW()) WHERE id=$1`,
          [t.id],
        );
        touched.push(t.id);

      } else {
        await client.query('ROLLBACK');
        reply.code(500);
        return err('ACCEPT_FAILED', `Unknown proposal_kind '${proposal.proposal_kind}'`);
      }

      // 4. Flip proposal status
      await client.query(
        `UPDATE memory_proposals
           SET status='accepted',
               reviewed_at=EXTRACT(EPOCH FROM NOW()),
               reviewed_by=$1
         WHERE id=$2`,
        [reviewer, proposalId],
      );

      // 5. Audit event (inside the transaction — auto-rollback if anything later fails)
      const eventId = 'ie_' + randomUUID();
      await client.query(
        `INSERT INTO intellect_events (id, event_type, source_type, details_json, created_at)
         VALUES ($1, 'proposal_accepted', 'review_surface', $2::jsonb, EXTRACT(EPOCH FROM NOW()))`,
        [
          eventId,
          JSON.stringify({
            proposal_id: proposalId,
            dream_run_id: proposal.dream_run_id,
            silo_id: proposal.silo_id,
            proposal_kind: proposal.proposal_kind,
            target_directive_ids_touched: touched,
            reviewer,
          }),
        ],
      );

      await client.query('COMMIT');

      // 6. Post-commit SSE broadcast (never inside the transaction)
      broadcast('proposals:resolved', {
        proposal_id: proposalId,
        status: 'accepted',
        silo_id: proposal.silo_id,
        dream_run_id: proposal.dream_run_id,
      });

      return ok({
        proposal_id: proposalId,
        status: 'accepted',
        directive_ids_touched: touched,
        intellect_event_id: eventId,
      });

    } catch (e: unknown) {
      try { await client.query('ROLLBACK'); } catch { /* non-fatal */ }
      const msg = e instanceof Error ? e.message : String(e);
      // Trigger fallback message — log but surface ACCEPT_FAILED so UI sees a clean code
      console.error('[admin/dreams accept] transaction error:', msg);
      reply.code(500);
      return err('ACCEPT_FAILED', `Accept failed: ${msg.slice(0, 200)}`);
    } finally {
      client.release();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/admin/dreams/proposals/:id/reject
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/proposals/:id/reject', async (req, reply) => {
    const { id: proposalId } = req.params as { id: string };
    const reviewer = req.sessionUser?.username ?? 'admin';
    const body = (req.body ?? {}) as { reason?: string };

    // Symmetric atomicity with accept: single transaction, FOR UPDATE row lock,
    // UPDATE + INSERT intellect_events in one COMMIT, ROLLBACK on any error.
    // Post-commit broadcast (Pitfall 1 — never broadcast inside an open txn).
    const client = await pool.connect();
    let siloId = '';
    let dreamRunId = '';
    const eventId = 'ie_' + randomUUID();
    try {
      await client.query('BEGIN');

      const existingRes = await client.query<{ status: string; silo_id: string; dream_run_id: string }>(
        `SELECT status, silo_id, dream_run_id FROM memory_proposals WHERE id = $1 FOR UPDATE`,
        [proposalId],
      );
      if (existingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return err('NOT_FOUND', 'Proposal not found');
      }
      const existing = existingRes.rows[0];
      if (existing.status !== 'pending') {
        await client.query('ROLLBACK');
        reply.code(409);
        return err('INVALID_STATE', `Cannot reject proposal with status '${existing.status}'`);
      }
      siloId = existing.silo_id;
      dreamRunId = existing.dream_run_id;

      await client.query(
        `UPDATE memory_proposals
           SET status='rejected',
               reviewed_at=EXTRACT(EPOCH FROM NOW()),
               reviewed_by=$1
         WHERE id=$2`,
        [reviewer, proposalId],
      );

      await client.query(
        `INSERT INTO intellect_events (id, event_type, source_type, details_json, created_at)
         VALUES ($1, 'proposal_rejected', 'review_surface', $2::jsonb, EXTRACT(EPOCH FROM NOW()))`,
        [
          eventId,
          JSON.stringify({
            proposal_id: proposalId,
            dream_run_id: dreamRunId,
            silo_id: siloId,
            reviewer,
            reason: body.reason ?? null,
          }),
        ],
      );

      await client.query('COMMIT');
    } catch (e: unknown) {
      try { await client.query('ROLLBACK'); } catch { /* non-fatal */ }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[admin/dreams reject] transaction error:', msg);
      reply.code(500);
      return err('REJECT_FAILED', `Reject failed: ${msg.slice(0, 200)}`);
    } finally {
      client.release();
    }

    // Post-commit SSE broadcast (never inside the transaction)
    broadcast('proposals:resolved', {
      proposal_id: proposalId,
      status: 'rejected',
      silo_id: siloId,
      dream_run_id: dreamRunId,
    });

    return ok({ proposal_id: proposalId, status: 'rejected', intellect_event_id: eventId });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/dreams/runs
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/runs', async (req) => {
    const q = req.query as { silo_id?: string; status?: string; limit?: string };
    const limit = Math.min(Math.max(parseInt(q.limit ?? '20', 10) || 20, 1), 100);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (q.silo_id) { conditions.push(`dr.silo_id = $${idx++}`); params.push(q.silo_id); }
    if (q.status)  { conditions.push(`dr.status = $${idx++}`);  params.push(q.status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const runs = await queryAll<DreamRunRow & {
      proposals_count: string;
      pending_count: string;
      accepted_count: string;
      rejected_count: string;
      expired_count: string;
    }>(
      `SELECT dr.*,
        (SELECT COUNT(*) FROM memory_proposals WHERE dream_run_id = dr.id)::text AS proposals_count,
        (SELECT COUNT(*) FROM memory_proposals WHERE dream_run_id = dr.id AND status='pending')::text  AS pending_count,
        (SELECT COUNT(*) FROM memory_proposals WHERE dream_run_id = dr.id AND status='accepted')::text AS accepted_count,
        (SELECT COUNT(*) FROM memory_proposals WHERE dream_run_id = dr.id AND status='rejected')::text AS rejected_count,
        (SELECT COUNT(*) FROM memory_proposals WHERE dream_run_id = dr.id AND status='expired')::text  AS expired_count
       FROM dream_runs dr
       ${where}
       ORDER BY dr.started_at DESC
       LIMIT $${idx}`,
      params,
    );

    // Convert text counts → number for response cleanliness
    const cleanRuns = runs.map(r => ({
      ...r,
      proposals_count: parseInt(r.proposals_count, 10),
      pending_count: parseInt(r.pending_count, 10),
      accepted_count: parseInt(r.accepted_count, 10),
      rejected_count: parseInt(r.rejected_count, 10),
      expired_count: parseInt(r.expired_count, 10),
    }));

    return ok({ runs: cleanRuns, count: cleanRuns.length });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/dreams/runs/:id
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const run = await queryOne<DreamRunRow & { dispatch_id: string | null }>(
      `SELECT * FROM dream_runs WHERE id = $1`,
      [id],
    );
    if (!run) {
      reply.code(404);
      return err('NOT_FOUND', 'Dream run not found');
    }

    const proposals = await queryAll<MemoryProposalRow>(
      `SELECT * FROM memory_proposals WHERE dream_run_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [id],
    );

    let dispatch: Record<string, unknown> | null = null;
    if (run.dispatch_id) {
      dispatch = await queryOne(
        `SELECT * FROM bridge_dispatch_log WHERE id = $1`,
        [run.dispatch_id],
      );
    }

    return ok({ run, proposals, dispatch });
  });
}
