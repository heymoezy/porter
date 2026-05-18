import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { ingestDoc, type IngestInput } from '../../services/recall-ingest.js';

// Recall doc-Q&A routes. Mounted at /api/v1/recall by routes/v1/index.ts.
// Project-scoped storage for cross-project document retrieval — first
// consumer is Tom (YMC WhatsApp agent). Auth is requireAuth; YMC backend
// presents X-Porter-Service-Token from localhost to get platform_admin.
export default async function recallV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // POST /api/v1/recall/docs/ingest
  // Body: { project, source_id, title?, text, mime?, sha256?, metadata? }
  // Idempotent on (project, source_id) — re-ingest replaces chunks transactionally.
  fastify.post<{ Body: Partial<IngestInput> }>(
    '/docs/ingest',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const body = request.body ?? {};
      const project = typeof body.project === 'string' ? body.project.trim() : '';
      const sourceId = typeof body.source_id === 'string' ? body.source_id.trim() : '';
      const text = typeof body.text === 'string' ? body.text : '';

      if (!project) {
        return reply.code(400).send(err('INVALID_INPUT', 'project is required', request.id));
      }
      if (!sourceId) {
        return reply.code(400).send(err('INVALID_INPUT', 'source_id is required', request.id));
      }
      if (!text.trim()) {
        return reply.code(400).send(err('INVALID_INPUT', 'text is required and must be non-empty', request.id));
      }

      try {
        const result = await ingestDoc(pool, {
          project,
          source_id: sourceId,
          title: typeof body.title === 'string' ? body.title : undefined,
          text,
          mime: typeof body.mime === 'string' ? body.mime : undefined,
          sha256: typeof body.sha256 === 'string' ? body.sha256 : undefined,
          metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
        });
        return reply.send(ok(result, request.id));
      } catch (e: any) {
        return reply
          .code(500)
          .send(err('INGEST_FAILED', e?.message ?? 'ingest failed', request.id));
      }
    },
  );
}
