import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { ingestDoc, type IngestInput } from '../../services/recall-ingest.js';
import { queryDocs, type QueryInput } from '../../services/recall-query.js';
import { summarizeDoc, type SummarizeInput } from '../../services/recall-summarize.js';

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

  // POST /api/v1/recall/docs/query
  // Body: { project, question, filters?: { source_ids?: string[] }, k? }
  // Retrieves top-K chunks via Postgres FTS (trigram fallback) and synthesises
  // an answer via codex_cli through the Bridge. Returns {answer, citations,
  // chunks_considered, latencyMs}.
  fastify.post<{ Body: Partial<QueryInput> }>(
    '/docs/query',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const body = request.body ?? {};
      const project = typeof body.project === 'string' ? body.project.trim() : '';
      const question = typeof body.question === 'string' ? body.question.trim() : '';

      if (!project) {
        return reply.code(400).send(err('INVALID_INPUT', 'project is required', request.id));
      }
      if (!question) {
        return reply.code(400).send(err('INVALID_INPUT', 'question is required and must be non-empty', request.id));
      }

      // Validate filters.source_ids if provided
      let sourceIds: string[] | undefined;
      if (body.filters !== undefined && body.filters !== null) {
        if (typeof body.filters !== 'object' || Array.isArray(body.filters)) {
          return reply.code(400).send(err('INVALID_INPUT', 'filters must be an object', request.id));
        }
        const sids = (body.filters as { source_ids?: unknown }).source_ids;
        if (sids !== undefined) {
          if (!Array.isArray(sids) || !sids.every((x) => typeof x === 'string')) {
            return reply.code(400).send(err('INVALID_INPUT', 'filters.source_ids must be an array of strings', request.id));
          }
          sourceIds = sids as string[];
        }
      }

      // Validate + clamp k
      let k: number | undefined;
      if (body.k !== undefined && body.k !== null) {
        if (typeof body.k !== 'number' || !Number.isFinite(body.k)) {
          return reply.code(400).send(err('INVALID_INPUT', 'k must be a number', request.id));
        }
        k = Math.floor(body.k);
        if (k < 1) k = 1;
        if (k > 20) k = 20;
      }

      try {
        const result = await queryDocs(pool, {
          project,
          question,
          filters: sourceIds ? { source_ids: sourceIds } : undefined,
          k,
        });
        return reply.send(ok(result, request.id));
      } catch (e: any) {
        return reply
          .code(500)
          .send(err('QUERY_FAILED', e?.message ?? 'query failed', request.id));
      }
    },
  );

  // POST /api/v1/recall/docs/summarize
  // Body: { project, source_id, force_refresh? }
  // Returns the structured LLM extraction for the doc (summary, doc_type,
  // entities, key_facts). Cached on recall_doc_sources.summary — repeat
  // asks are free unless force_refresh=true.
  fastify.post<{ Body: Partial<SummarizeInput> }>(
    '/docs/summarize',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const body = request.body ?? {};
      const project = typeof body.project === 'string' ? body.project.trim() : '';
      const sourceId = typeof body.source_id === 'string' ? body.source_id.trim() : '';
      const forceRefresh = body.force_refresh === true;

      if (!project) {
        return reply.code(400).send(err('INVALID_INPUT', 'project is required', request.id));
      }
      if (!sourceId) {
        return reply.code(400).send(err('INVALID_INPUT', 'source_id is required', request.id));
      }

      try {
        const result = await summarizeDoc(pool, { project, source_id: sourceId, force_refresh: forceRefresh });
        return reply.send(ok(result, request.id));
      } catch (e: any) {
        if (e?.code === 'NOT_FOUND') {
          return reply.code(404).send(err('NOT_FOUND', e.message, request.id));
        }
        if (e?.code === 'NO_TEXT') {
          return reply.code(409).send(err('NO_TEXT', e.message, request.id));
        }
        return reply
          .code(500)
          .send(err('SUMMARIZE_FAILED', e?.message ?? 'summarize failed', request.id));
      }
    },
  );
}
