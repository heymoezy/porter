/**
 * Porter Releases API (R2) — the read-only enforcement surface for the unified
 * release system. Porter is the SOT for release consistency across all
 * registered projects; these endpoints expose the project registry + the
 * drift/audit report the release-kit computes (release-kit/audit.ts).
 *
 * All endpoints are READ-ONLY: they never mutate a repo, hook, or manifest.
 * They only observe on-disk state (git config, manifest, hooks, version file)
 * and report drift. Repo wiring itself is R3+ (operator-driven).
 *
 * Endpoints (mounted under /api/admin/releases):
 *   GET /projects        registry + a compact per-project audit status
 *   GET /audit           full drift report + top-line consistent|drift verdict
 *   GET /project/:id     one project's registry entry + full audit detail
 */
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { PROJECT_REGISTRY } from '../../release-kit/project-registry.js';
import { KIT_VERSION } from '../../release-kit/manifest-schema.js';
import { auditAll, auditProjectById } from '../../release-kit/audit.js';

export default async function releasesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/releases/projects — the registry plus a compact audit status
  // for each project (booleans + drift reason count). The full per-check detail
  // lives on /audit and /project/:id.
  fastify.get('/projects', async (_req, reply) => {
    const report = auditAll();
    const byId = new Map(report.projects.map((p) => [p.project, p]));
    const projects = PROJECT_REGISTRY.map((p) => {
      const a = byId.get(p.id);
      return {
        id: p.id,
        kind: p.kind,
        repoRoot: p.repoRoot,
        productized: p.productized,
        status: a
          ? {
              wired: a.wired,
              manifestValid: a.manifestValid,
              hooksWired: a.hooksWired,
              kitVersionOk: a.kitVersionOk,
              versionFilePresent: a.versionFilePresent,
              driftCount: a.driftReasons.length,
              lastRelease: a.lastRelease ?? null,
            }
          : null,
      };
    });
    return reply.send(ok({ kitVersion: KIT_VERSION, count: projects.length, projects }));
  });

  // GET /api/admin/releases/audit — full drift report across every registered
  // project + a top-line verdict (consistent only when ALL are wired).
  fastify.get('/audit', async (_req, reply) => {
    return reply.send(ok(auditAll()));
  });

  // GET /api/admin/releases/project/:id — one project's registry entry + full
  // audit detail (per-check flags, per-hook status, drift reasons).
  fastify.get('/project/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = PROJECT_REGISTRY.find((p) => p.id === id);
    if (!project) {
      reply.code(404);
      return err('NOT_FOUND', `no registered project '${id}'`);
    }
    const audit = auditProjectById(id);
    return reply.send(ok({
      id: project.id,
      kind: project.kind,
      repoRoot: project.repoRoot,
      productized: project.productized,
      kitVersion: KIT_VERSION,
      audit,
    }));
  });
}
