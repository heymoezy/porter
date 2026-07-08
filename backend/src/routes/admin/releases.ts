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
import { z } from 'zod';
import { ok, err } from '../../lib/admin-envelope.js';
import { PROJECT_REGISTRY } from '../../release-kit/project-registry.js';
import { KIT_VERSION } from '../../release-kit/manifest-schema.js';
import { auditAll, auditProjectById } from '../../release-kit/audit.js';
import { reconcileReleases } from '../../services/release-reconciler.js';

/**
 * R3 audit-only register store. Records the LAST release each project reported
 * via `porter-release register` (delegate-mode telemetry). Deliberately
 * in-memory keyed by project (last-write-wins) — the wired/drift verdict itself
 * is recomputed from on-disk state on every audit call, so this store only adds
 * the "when did it last ship" timeline and survives repeated registers as a
 * benign overwrite. Durable persistence (a releases table) is deferred to R4.
 */
interface Registration {
  project: string;
  kind: string;
  version: string;
  kitVersion: string;
  mode: string;
  /** client-reported release timestamp. */
  at: string;
  /** server receive timestamp. */
  receivedAt: string;
}
const REGISTRATIONS = new Map<string, Registration>();

const registerBody = z.object({
  project: z.string().min(1),
  kind: z.string().min(1),
  version: z.string().min(1),
  kitVersion: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  at: z.string().min(1).optional(),
});

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
        lastRegistered: REGISTRATIONS.get(p.id) ?? null,
      };
    });
    return reply.send(ok({ kitVersion: KIT_VERSION, count: projects.length, projects }));
  });

  // POST /api/admin/releases/register — audit-only intake. A delegate-mode repo's
  // post-commit calls this (non-fatal) to record its last release. Authenticated
  // by the shared localhost service token (X-Porter-Service-Token → platform_admin
  // via the auth plugin), so no new secret is distributed. Read-only w.r.t. repos.
  fastify.post('/register', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return err('BAD_REQUEST', `invalid register payload: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const b = parsed.data;
    if (!PROJECT_REGISTRY.find((p) => p.id === b.project)) {
      reply.code(404);
      return err('NOT_FOUND', `unknown project '${b.project}' — not in the release registry`);
    }
    REGISTRATIONS.set(b.project, {
      project: b.project,
      kind: b.kind,
      version: b.version,
      kitVersion: b.kitVersion ?? '',
      mode: b.mode ?? 'full',
      at: b.at ?? new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    });
    return reply.send(ok({ recorded: true, project: b.project, version: b.version }));
  });

  // GET /api/admin/releases/registrations — the audit-only register timeline.
  fastify.get('/registrations', async (_req, reply) => {
    return reply.send(ok({ count: REGISTRATIONS.size, registrations: [...REGISTRATIONS.values()] }));
  });

  // GET /api/admin/releases/audit — full drift report across every registered
  // project + a top-line verdict (consistent only when ALL are wired).
  fastify.get('/audit', async (_req, reply) => {
    return reply.send(ok(auditAll()));
  });

  // POST /api/admin/releases/reconcile — re-assert the group announce for every
  // project's current version (idempotent). Manual trigger of the same routine
  // the scheduler runs every 10 min; also self-heals any skipped announce.
  fastify.post('/reconcile', async (_req, reply) => {
    const results = await reconcileReleases();
    return reply.send(ok({ reconciled: results.length, filled: results.filter(r => r.announced).length, results }));
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
