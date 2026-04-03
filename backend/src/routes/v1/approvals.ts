/**
 * approvals.ts — Approval Gate REST Endpoints
 *
 * Phase 45 Plan 02 (PCP-03): REST interface for managing high-risk action
 * approval requests. All endpoints require platform_admin role.
 *
 * Routes (all under /api/v1/approvals):
 *   GET    /              — List pending approval requests
 *   GET    /:id           — Get a single approval request
 *   POST   /:id/approve   — Approve a pending request
 *   POST   /:id/reject    — Reject a pending request
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import {
  listPendingApprovals,
  getApprovalRequest,
  approveRequest,
  rejectRequest,
} from '../../services/control-plane/approval-gate.js';

export default async function approvalV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // ── GET / — List pending approvals ───────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'platform_admin') {
      return reply.code(403).send(err('FORBIDDEN', 'platform_admin role required'));
    }

    const approvals = await listPendingApprovals();
    return ok({ approvals, count: approvals.length });
  });

  // ── GET /:id — Get a single approval request ────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'platform_admin') {
      return reply.code(403).send(err('FORBIDDEN', 'platform_admin role required'));
    }

    const approval = await getApprovalRequest(request.params.id);
    if (!approval) {
      return reply.code(404).send(err('NOT_FOUND', 'Approval request not found'));
    }
    return ok({ approval });
  });

  // ── POST /:id/approve — Approve a pending request ───────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'platform_admin') {
      return reply.code(403).send(err('FORBIDDEN', 'platform_admin role required'));
    }

    const approval = await approveRequest(
      request.params.id,
      request.sessionUser!.username,
    );
    if (!approval) {
      return reply.code(404).send(err('NOT_FOUND', 'Approval request not found or not pending'));
    }
    return ok({ approval });
  });

  // ── POST /:id/reject — Reject a pending request ─────────────────────────
  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>('/:id/reject', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'platform_admin') {
      return reply.code(403).send(err('FORBIDDEN', 'platform_admin role required'));
    }

    const body = request.body as { reason?: string } | undefined;
    const approval = await rejectRequest(
      request.params.id,
      request.sessionUser!.username,
      body?.reason,
    );
    if (!approval) {
      return reply.code(404).send(err('NOT_FOUND', 'Approval request not found or not pending'));
    }
    return ok({ approval });
  });
}
