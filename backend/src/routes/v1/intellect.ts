/**
 * Intellect API routes — context delivery, event stream, feedback.
 *
 * GET /api/v1/intellect/context?project=X  — scoped memory for CLI session
 * GET /api/v1/intellect/events              — recent Intellect events (polling)
 * POST /api/v1/intellect/validate            — trigger manual memory validation
 * POST /api/v1/intellect/feedback            — user feedback on Intellect decisions
 */

import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { ok, err } from '../../lib/envelope.js';
import { runMemoryValidation } from '../../services/intellect/memory-validator.js';
import { analyzeAndStoreSession } from '../../services/intellect/session-analyzer.js';
import { runMemoryPromotion } from '../../services/intellect/memory-promoter.js';
import { runDispatchScoring } from '../../services/intellect/dispatch-scorer.js';
import { emitEvent, runDreamProposalsReviewDigest } from '../../services/intellect/workflow-engine.js';
import { runMemoryPruning } from '../../services/intellect/memory-pruner.js';
import { runSelfMonitor } from '../../services/intellect/self-monitor.js';
import { runPatternMining } from '../../services/intellect/pattern-miner.js';
import { runToolDetection } from '../../services/intellect/tool-detector.js';
import { runSubscriptionCheck } from '../../services/intellect/subscription-manager.js';
import { detectContext } from '../../services/intellect/silo-detector.js';
import { insertTurn } from '../../services/intellect/transcript-capture.js';
import { runTranscriptRetention } from '../../services/intellect/transcript-retention.js';
import { runDreamWorker } from '../../services/intellect/dream-worker.js';
import { scheduleDirectivesMirror } from '../../services/intellect/vault-mirror.js';
import { runVaultIndexing, VAULT_CONFIDENCE_BOOST } from '../../services/intellect/vault-indexer.js';
import { runClaudeRulesMirror } from '../../services/intellect/claude-rules-mirror.js';
import { runFailureDigestDistill } from '../../services/intellect/failure-digest.js';
import { runWorkerKnowledgeRefresh } from '../../services/intellect/worker-knowledge.js';
import { runGithubScan } from '../../services/intellect/github-scan.js';
import { randomUUID } from 'node:crypto';
import { resolveActiveProject, setActiveProject, clearActiveProject, recentProjects } from '../../services/intellect/active-project.js';
import { observeShadow, shadowFlagOn, canaryScopes } from '../../services/memory-injection-v2.js';

// Surprise-salience write-gate (R3). An agent episode is skipped when its
// salience (1 − max trigram-similarity vs recent episodes + active concepts)
// falls below this — i.e. it's a near-duplicate of something already known —
// unless the caller forces it. Conservative to start (kills only close dups);
// tune up from logged `agent_memory_write[_skipped]` salience scores.
const EPISODE_SURPRISE_MIN = 0.3;

// Supersede-on-conflict threshold (R4). A new agent rule/correction archives the
// most-similar existing active rule when trigram-similarity is at least this —
// replacing a near-dup or contradicted rule rather than stacking. Conservative so
// genuinely distinct rules coexist.
const DIRECTIVE_SUPERSEDE_SIM = 0.5;

interface DirectiveRow {
  id: string;
  scope: string;
  scope_id: string | null;
  content: string;
  priority: number;
  verified_at: number | null;
}

interface ConceptRow {
  id: string;
  scope: string;
  scope_id: string | null;
  content: string;
  trust_tier: string;
  confidence_score: number;
  source_type: string;
  source_url: string | null;
}

interface EpisodeRow {
  id: string;
  scope_id: string | null;
  summary: string;
  files_changed_json: unknown;
  created_at: number;
}

interface IntellectEventRow {
  id: string;
  event_type: string;
  source_type: string;
  details_json: unknown;
  created_at: number;
}

export default async function intellectRoutes(fastify: FastifyInstance) {
  // ── GET /context — scoped memory for CLI session injection ────────────

  fastify.get('/context', async (request, reply) => {
    const { project, scope, cwd, session_id } = request.query as {
      project?: string;
      scope?: string;
      cwd?: string;
      session_id?: string;
    };
    void scope; // currently unused but reserved for future scope filtering

    // ─── Phase 49 LRN-03/04 ─────────────────────────────────────────────
    // detectContext composes detectSilos + detectProject in a single call.
    // Silos feed the silo section below; projectId is the server-side
    // cwd→project mapping that LRN-03 layers into project-scope queries.
    // The explicit ?project= query param wins for back-compat (the
    // porter-session-start hook still passes both project= and cwd=, so
    // live hook behavior is unchanged). Fail-open: never break /context
    // because of detection failure.
    let detectedContext: { silos: Array<{ id: string; displayName: string }>; projectId: string | null } = {
      silos: [],
      projectId: null,
    };
    try {
      detectedContext = await detectContext(
        { cwd, projectName: project, sessionId: session_id },
        pool,
      );
    } catch (detectErr) {
      request.log.warn(
        { err: detectErr },
        '[intellect] detectContext failed — continuing without silo/project derivation',
      );
    }
    const effectiveProject: string | null = project ?? detectedContext.projectId ?? null;
    const projectIdSource: 'query' | 'cwd' | 'none' =
      project ? 'query' : detectedContext.projectId ? 'cwd' : 'none';
    const projectIsServerDerived = projectIdSource === 'cwd';

    // ─── R4.1 SHADOW CANARY (SessionStart hot path) ─────────────────────────
    // Guarded, fire-and-forget, side-effect-ONLY. When both injection flags are
    // OFF (default) this block is inert — no V2 work, no DB calls — and the
    // /context response below is byte-identical to before. When SHADOW=1 (or a
    // canary scope is configured) it shadow-computes the legacy-vs-vault 6-tier
    // builder and logs a structured comparison. It NEVER awaits into, or
    // changes, the injected /context bytes, and never throws.
    if (shadowFlagOn() || canaryScopes().size > 0) {
      void observeShadow({ projectId: effectiveProject ?? undefined }).catch(() => {});
    }

    // Fetch system directives (always apply)
    const { rows: systemDirectives } = await pool.query<DirectiveRow>(
      `SELECT id, scope, scope_id, content, priority, verified_at
       FROM directives
       WHERE status = 'active' AND scope = 'workspace'
       ORDER BY priority DESC`
    );

    // Fetch project-scoped directives — uses effectiveProject so cwd-only
    // callers see the same project directives that explicit-?project= callers see.
    let projectDirectives: DirectiveRow[] = [];
    if (effectiveProject) {
      const { rows } = await pool.query<DirectiveRow>(
        `SELECT id, scope, scope_id, content, priority, verified_at
         FROM directives
         WHERE status = 'active' AND scope = 'project' AND scope_id = $1
         ORDER BY priority DESC`,
        [effectiveProject]
      );
      projectDirectives = rows;
    }

    // Fetch relevant concepts (global + project-scoped) — symmetric with
    // project directives: cwd-only callers now also see project-scope concepts.
    // U3: vault-sourced rows (curated truth, indexed by vault-indexer.ts) get
    // an additive confidence boost so they win slots against harvested rows of
    // similar standing — a ranking boost, not a filter (see VAULT_CONFIDENCE_BOOST).
    const conceptRank = `(confidence_score + CASE WHEN source_type = 'vault' THEN ${VAULT_CONFIDENCE_BOOST} ELSE 0 END)`;
    const conceptQuery = effectiveProject
      ? `SELECT id, scope, scope_id, content, trust_tier, confidence_score, source_type, source_url
         FROM concepts
         WHERE status = 'active' AND (scope = 'global' OR (scope = 'project' AND scope_id = $1))
         ORDER BY ${conceptRank} DESC, last_used_at DESC NULLS LAST
         LIMIT 20`
      : `SELECT id, scope, scope_id, content, trust_tier, confidence_score, source_type, source_url
         FROM concepts
         WHERE status = 'active' AND scope = 'global'
         ORDER BY ${conceptRank} DESC, last_used_at DESC NULLS LAST
         LIMIT 10`;
    const { rows: concepts } = await pool.query<ConceptRow>(
      conceptQuery,
      effectiveProject ? [effectiveProject] : []
    );

    // Fetch recent episodes — project-scoped first, then workspace-scoped fallback.
    // Most episodes are workspace-scoped (session analyzer doesn't always know the project).
    // Uses effectiveProject for symmetry — cwd-only callers see project-scope episodes too.
    let episodes: EpisodeRow[] = [];
    if (effectiveProject) {
      const { rows } = await pool.query<EpisodeRow>(
        `SELECT id, scope_id, summary, files_changed_json, created_at
         FROM episodes
         WHERE (scope = 'project' AND scope_id = $1)
            OR scope = 'workspace'
         ORDER BY created_at DESC
         LIMIT 5`,
        [effectiveProject]
      );
      episodes = rows;
    } else {
      const { rows } = await pool.query<EpisodeRow>(
        `SELECT id, scope_id, summary, files_changed_json, created_at
         FROM episodes
         ORDER BY created_at DESC
         LIMIT 5`
      );
      episodes = rows;
    }

    // ── Skill recommendations based on recent episode tool patterns ───
    // Lightweight: look at what tools were used most in recent episodes for
    // this project, map to skill categories, recommend top 2 skills.
    interface SkillRec { name: string; description: string }
    let skillRecs: SkillRec[] = [];
    try {
      // Get most-used tools from recent episodes for this project
      const { rows: recentEpisodes } = await pool.query<{ summary: string }>(
        `SELECT summary FROM episodes
         WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
         ORDER BY created_at DESC LIMIT 10`
      );
      // Parse tool counts from episode summaries: "tools: Bash×60, Edit×30"
      const toolCounts = new Map<string, number>();
      for (const ep of recentEpisodes) {
        const m = ep.summary.match(/tools: ([^—]+)/);
        if (!m) continue;
        for (const seg of m[1].split(',').map((s: string) => s.trim())) {
          const mm = seg.match(/^(\S+)×(\d+)/);
          if (mm) toolCounts.set(mm[1], (toolCounts.get(mm[1]) ?? 0) + parseInt(mm[2], 10));
        }
      }
      // Map dominant tools to skill IDs
      const TOOL_SKILL_MAP: Record<string, string[]> = {
        'Bash': ['backend-dev', 'devops-engineer'],
        'Edit': ['code-reviewer', 'code-implementer'],
        'Write': ['technical-writer', 'code-implementer'],
        'WebSearch': ['research-analyst', 'competitive-intelligence'],
        'WebFetch': ['research-analyst', 'web-designer'],
        'TaskCreate': ['project-architect', 'product-manager'],
        'Agent': ['system-architect', 'coding-agent'],
      };
      const skillScores = new Map<string, number>();
      for (const [tool, count] of toolCounts) {
        const mapped = TOOL_SKILL_MAP[tool];
        if (!mapped) continue;
        for (const sid of mapped) {
          skillScores.set(sid, (skillScores.get(sid) ?? 0) + count);
        }
      }
      const topSkillIds = [...skillScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([id]) => id);

      if (topSkillIds.length > 0) {
        const { rows: skillRows } = await pool.query<{ name: string; description: string }>(
          `SELECT name, description FROM skills WHERE id = ANY($1::text[])`,
          [topSkillIds]
        );
        skillRecs = skillRows;
      }
    } catch { /* non-critical */ }

    // Format as markdown for CLI injection
    const sections: string[] = [];

    sections.push('## Porter Context');
    if (effectiveProject) sections.push(`Project: **${effectiveProject}**`);
    sections.push('');

    if (systemDirectives.length > 0) {
      sections.push('### System Directives');
      for (const d of systemDirectives.slice(0, 15)) {
        sections.push(`- ${d.content}`);
      }
      sections.push('');
    }

    // ─── Phase 48.1: Silo Foundation — silo-scoped directives ───────────────
    // Silos are pre-detected at the top of the handler via detectContext
    // (Phase 49 LRN-04 — composite call avoids a second DB round trip).
    // Inject a labeled section per matching silo BETWEEN System Directives
    // and Project Directives so silo rules can amplify workspace rules but
    // project rules can still customize. Fail-open: never break /context.
    try {
      const silos = detectedContext.silos;
      if (silos.length > 0) {
        const siloIds = silos.map((s) => s.id);
        const siloDirectivesRes = await pool.query<{
          id: string;
          content: string;
          priority: number;
          scope_id: string;
        }>(
          `SELECT id, content, priority, scope_id FROM directives
           WHERE status = 'active' AND scope = 'silo' AND scope_id = ANY($1::text[])
           ORDER BY priority DESC LIMIT 20`,
          [siloIds],
        );
        // Group directives by scope_id so each silo gets its own section
        const bySilo = new Map<string, string[]>();
        for (const row of siloDirectivesRes.rows) {
          const bucket = bySilo.get(row.scope_id) ?? [];
          bucket.push(`- ${row.content}`);
          bySilo.set(row.scope_id, bucket);
        }
        for (const silo of silos) {
          const lines = bySilo.get(silo.id);
          if (!lines || lines.length === 0) continue;
          sections.push(
            `## Silo: ${silo.displayName} — Operating Rules\n${lines.join('\n')}`,
          );
          sections.push('');
        }
      }
    } catch (err) {
      request.log.warn(
        { err },
        '[intellect] silo detection/injection failed — continuing without silo section',
      );
    }

    if (projectDirectives.length > 0 && effectiveProject) {
      // Phase 49 LRN-03: header annotated when projectId came from cwd-derivation
      // rather than explicit ?project=. Purely cosmetic — helps debugging when a
      // client sees project directives it didn't explicitly ask for.
      const suffix = projectIsServerDerived ? ' — server-derived' : '';
      sections.push(`### Project Directives (${effectiveProject})${suffix}`);
      for (const d of projectDirectives) {
        sections.push(`- ${d.content}`);
      }
      sections.push('');
    }

    if (episodes.length > 0) {
      sections.push('### Recent Sessions');
      for (const e of episodes) {
        const when = new Date(e.created_at * 1000).toISOString().split('T')[0];
        sections.push(`- **${when}**: ${e.summary}`);
      }
      sections.push('');
    }

    if (concepts.length > 0) {
      sections.push('### Relevant Concepts');
      for (const c of concepts.slice(0, 8)) {
        // U3: vault-sourced concepts cite their vault node so the reader can
        // follow the truth to its source (source_url = absolute vault path).
        const cite = c.source_type === 'vault' && c.source_url
          ? ` _(vault: ${c.source_url.replace('/home/lobster/vault/', '')})_`
          : '';
        sections.push(`- ${c.content.substring(0, 200)}${c.content.length > 200 ? '...' : ''}${cite}`);
      }
    }

    if (skillRecs.length > 0) {
      sections.push('');
      sections.push('### Recommended Skills');
      for (const sr of skillRecs) {
        sections.push(`- **${sr.name}**: ${sr.description?.substring(0, 150) ?? ''}`);
      }
    }

    // Available tools (compact list)
    try {
      const { rows: toolRows } = await pool.query<{ tool_key: string }>(
        `SELECT tool_key FROM environment_tools WHERE detected = 1 AND health = 'ok' ORDER BY tool_key`
      );
      if (toolRows.length > 0) {
        sections.push('');
        sections.push(`### Available Tools (${toolRows.length})`);
        sections.push(toolRows.map(t => t.tool_key).join(', '));
      }
    } catch { /* non-critical */ }

    const contextText = sections.join('\n');

    return reply.send(ok({
      context: contextText,
      stats: {
        systemDirectives: systemDirectives.length,
        projectDirectives: projectDirectives.length,
        episodes: episodes.length,
        concepts: concepts.length,
        // Phase 49 LRN-03 observability — clients can see whether the project
        // scoping came from their explicit ?project= or from cwd-derivation.
        projectIdSource,
        effectiveProject,
      },
    }));
  });

  // ── GET /events — recent Intellect decisions (polling) ────────────────

  fastify.get('/events', async (request, reply) => {
    const { limit = '50', since } = request.query as { limit?: string; since?: string };
    const lim = Math.min(parseInt(limit, 10) || 50, 200);

    const { rows } = since
      ? await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           WHERE created_at > $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [parseFloat(since), lim]
        )
      : await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           ORDER BY created_at DESC
           LIMIT $1`,
          [lim]
        );

    return reply.send(ok({ events: rows, count: rows.length }));
  });

  // ── GET /stream — SSE stream of Intellect events ──────────────────────

  fastify.get('/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send heartbeat + poll for new events every 3 seconds
    let lastTimestamp = Date.now() / 1000;
    const interval = setInterval(async () => {
      try {
        const { rows } = await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           WHERE created_at > $1
           ORDER BY created_at ASC
           LIMIT 20`,
          [lastTimestamp]
        );
        if (rows.length > 0) {
          lastTimestamp = rows[rows.length - 1].created_at;
          for (const event of rows) {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } else {
          reply.raw.write(`:heartbeat\n\n`);
        }
      } catch (e) {
        console.error('[intellect:stream] error', e);
      }
    }, 3000);

    request.raw.on('close', () => {
      clearInterval(interval);
      reply.raw.end();
    });
  });

  // ── POST /validate — trigger manual memory validation ────────────────

  fastify.post('/validate', async (_request, reply) => {
    try {
      await runMemoryValidation();
      return reply.send(ok({ triggered: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('VALIDATION_FAILED', message));
    }
  });

  // ── Active project (Porter Backbone Identity, v6.22.0) ───────────────────
  //
  // Porter is infrastructure, not a project. The "active project" is which
  // peer the user is currently working on (ymc.capital, Porter-the-repo,
  // Deals/Stablekey, etc.). One source of truth. Hooks query this; deploy
  // scripts write it; cwd takes priority over the DB pin when available.

  // ── GET /directives — scoped directive lookup ────────────────────────────
  //
  // Returns active directives by scope. Consumers (YMC tom-llm, future agent
  // shims) call this to fetch project-scoped or silo-scoped operating rules
  // and inject them into a prompt. ONE TRUTH lives here — agents don't keep
  // local directive copies; they pull on every turn (or cache briefly).

  fastify.get('/directives', async (request, reply) => {
    const q = request.query as { scope?: string; scope_id?: string; limit?: string };
    const scope = String(q?.scope || 'workspace').trim();
    const scopeId = q?.scope_id ? String(q.scope_id).trim() : null;
    const limit = Math.min(parseInt(String(q?.limit || '40'), 10) || 40, 200);
    const args: any[] = [scope, limit];
    let sql = `SELECT id, scope, scope_id, content, priority, source_type, tags, created_at
                 FROM directives
                WHERE status = 'active' AND scope = $1`;
    if (scopeId) { sql += ` AND scope_id = $3`; args.splice(1, 0, scopeId); /* awkward — rebuild */ }
    // Rebuild cleanly to avoid placeholder confusion
    const params: any[] = [scope];
    let where = `status = 'active' AND scope = $1`;
    if (scopeId) { params.push(scopeId); where += ` AND scope_id = $${params.length}`; }
    params.push(limit);
    const finalSql = `SELECT id, scope, scope_id, content, priority, source_type, tags, created_at
                        FROM directives WHERE ${where}
                       ORDER BY priority DESC NULLS LAST, created_at DESC LIMIT $${params.length}`;
    const rows = (await pool.query(finalSql, params)).rows;
    return reply.send(ok({ scope, scope_id: scopeId, count: rows.length, directives: rows }));
  });

  // ── Agent memory surface (v6.29.0) — lets non-CLI agents (Tom,
  // any future persona) READ and WRITE the shared brain. Agnostic: `agent` is
  // a scope_id, never a hardcoded name. 127.0.0.1-only (server bind), same
  // auth posture as the rest of this file.
  //
  // WRITE:  POST /agent-memory
  //   {agent, kind:'episode',   content}                  → episodes (scope='agent')
  //   {agent, kind:'concept',   content}                  → concepts (scope='agent', FTS-indexed)
  //   {agent, kind:'directive', content, priority?, tags?} → directives ACTIVE immediately
  //       (auto-learn, per Moe 2026-06-10: agents learn without a review queue,
  //        announce in their own channel; corrections happen in chat via archive)
  //   {agent, kind:'directive', action:'archive', query}  → archive matching
  //       agent-learned directives ONLY (source_type='agent_learned' — the
  //       protect_moe_direct trigger + this filter keep human rules untouchable)
  //
  // READ:   GET /agent-memory/recall?agent=X&q=...&project=Y&limit=N
  //   Unified ranked recall: concepts via search_vector FTS + episodes via
  //   on-the-fly tsvector (971 rows — trivial), across the agent's own scope
  //   AND the named project scope. Also returns the agent's latest episodes
  //   (`recent`) for conversational continuity regardless of q matches.
  fastify.post('/agent-memory', async (request, reply) => {
    const body = (request.body || {}) as {
      agent?: string; kind?: string; content?: string; action?: string;
      query?: string; priority?: number; tags?: string[]; session_id?: string; force?: boolean;
    };
    const agent = String(body.agent || '').trim().toLowerCase();
    const kind = String(body.kind || '').trim();
    if (!agent || !/^[a-z0-9_-]{2,40}$/.test(agent)) return reply.code(400).send(err('INVALID_INPUT', 'agent required (slug)'));
    if (!['episode', 'concept', 'directive'].includes(kind)) return reply.code(400).send(err('INVALID_INPUT', 'kind must be episode|concept|directive'));

    if (kind === 'directive' && body.action === 'archive') {
      const query = String(body.query || '').trim();
      if (!query) return reply.code(400).send(err('INVALID_INPUT', 'query required for archive'));
      const res = await pool.query(
        `UPDATE directives SET status='archived', updated_at=EXTRACT(epoch FROM now())
          WHERE scope='agent' AND scope_id=$1 AND source_type='agent_learned'
            AND status='active' AND content ILIKE '%' || $2 || '%'
          RETURNING id, content`,
        [agent, query],
      );
      if ((res.rowCount ?? 0) > 0) scheduleDirectivesMirror(); // U1: keep vault mirror current (debounced, fire-and-forget)
      return reply.send(ok({ archived: res.rowCount, directives: res.rows }));
    }

    const content = String(body.content || '').trim();
    if (!content || content.length > 4000) return reply.code(400).send(err('INVALID_INPUT', 'content required (≤4000 chars)'));
    const id = randomUUID();
    if (kind === 'episode') {
      // Surprise-salience write-gate (R3): salience = 1 − max trigram-similarity
      // of this summary vs the agent's recent episodes + active concepts. Skip a
      // low-surprise (near-dup/routine) episode unless the caller forces it
      // (corrections / new-entity turns are always memory-worthy). Keeps the
      // episode stream high-signal and feeds salience-weighted recall + the dream.
      const force = body.force === true;
      const sim = (await pool.query<{ maxsim: number }>(
        `SELECT GREATEST(
                  COALESCE((SELECT MAX(similarity(e.summary, $2))
                              FROM (SELECT summary FROM episodes
                                     WHERE scope='agent' AND scope_id=$1
                                     ORDER BY created_at DESC LIMIT 30) e), 0),
                  COALESCE((SELECT MAX(similarity(c.content, $2))
                              FROM concepts c
                             WHERE c.scope='agent' AND c.scope_id=$1 AND c.status='active'), 0)
                ) AS maxsim`,
        [agent, content],
      )).rows[0];
      const salience = Math.max(0, Math.min(1, 1 - Number(sim?.maxsim ?? 0)));
      if (!force && salience < EPISODE_SURPRISE_MIN) {
        pool.query(
          `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
          [randomUUID(), 'agent_memory_write_skipped', 'agent-memory', JSON.stringify({ agent, salience: Number(salience.toFixed(3)), preview: content.slice(0, 100) })],
        ).catch(() => undefined);
        return reply.send(ok({ id: null, kind, agent, skipped: 'low_surprise', salience: Number(salience.toFixed(3)) }));
      }
      await pool.query(
        `INSERT INTO episodes (id, scope, scope_id, session_id, gateway, summary, salience)
         VALUES ($1, 'agent', $2, $3, 'agent-memory', $4, $5)`,
        [id, agent, body.session_id ?? null, content, salience],
      );
      pool.query(
        `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
        [randomUUID(), 'agent_memory_write', 'agent-memory', JSON.stringify({ agent, kind, salience: Number(salience.toFixed(3)), forced: force, preview: content.slice(0, 140) })],
      ).catch(() => undefined);
      return reply.send(ok({ id, kind, agent, salience: Number(salience.toFixed(3)) }));
    } else if (kind === 'concept') {
      await pool.query(
        `INSERT INTO concepts (id, memory_kind, trust_tier, scope, scope_id, content, source_type, review_state)
         VALUES ($1, 'concept', 'medium', 'agent', $2, $3, 'agent', 'accepted')`,
        [id, agent, content],
      );
    } else {
      const priority = Math.min(Math.max(Number(body.priority) || 70, 1), 89); // < 90: never outrank moe-direct
      // Supersede-on-conflict (R4): a new correction/rule archives the most-similar
      // existing active agent rule instead of stacking a near-duplicate or leaving a
      // now-contradicted one live. Reversible — status flip + supersedes_id, never a
      // delete. Keeps "## Learned Directives" lean and non-contradictory.
      const dup = (await pool.query<{ id: string; sim: number }>(
        `SELECT id, similarity(content, $2) AS sim FROM directives
          WHERE scope='agent' AND scope_id=$1 AND status='active' AND source_type='agent_learned'
          ORDER BY sim DESC LIMIT 1`,
        [agent, content],
      )).rows[0];
      let supersedesId: string | null = null;
      if (dup && Number(dup.sim) >= DIRECTIVE_SUPERSEDE_SIM) {
        await pool.query(`UPDATE directives SET status='archived', updated_at=EXTRACT(epoch FROM now()) WHERE id=$1`, [dup.id]);
        supersedesId = dup.id;
      }
      await pool.query(
        `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, tags, supersedes_id)
         VALUES ($1, 'agent', $2, $3, $4, 'agent_learned', 'active', $2, $5, $6)`,
        [id, agent, content, priority, body.tags ?? null, supersedesId],
      );
      scheduleDirectivesMirror(); // U1: keep vault mirror current (debounced, fire-and-forget)
    }
    // Flow telemetry for the Brain screen (fire-and-forget).
    pool.query(
      `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
      [randomUUID(), 'agent_memory_write', 'agent-memory', JSON.stringify({ agent, kind, preview: content.slice(0, 140) })],
    ).catch(() => undefined);
    return reply.send(ok({ id, kind, agent }));
  });

  fastify.get('/agent-memory/recall', async (request, reply) => {
    const q = request.query as { agent?: string; q?: string; project?: string; limit?: string; recent?: string; session?: string };
    const agent = String(q?.agent || '').trim().toLowerCase();
    if (!agent) return reply.code(400).send(err('INVALID_INPUT', 'agent required'));
    const query = String(q?.q || '').trim();
    const project = q?.project ? String(q.project).trim() : null;
    const limit = Math.min(parseInt(String(q?.limit || '6'), 10) || 6, 20);
    const recentN = Math.min(parseInt(String(q?.recent || '3'), 10) || 3, 10);
    const session = q?.session ? String(q.session).trim().slice(0, 200) : null;

    const hits: Array<{ kind: string; content: string; created_at: number; rank: number }> = [];
    // websearch_to_tsquery ANDs every term, so a multiword natural-language ask
    // (e.g. a whole WhatsApp message) almost never matched any single memory row
    // — recall returned 0 FTS hits on ~99% of real turns and silently fell back
    // to recent-only. OR-join the salient tokens into to_tsquery and let ts_rank
    // discriminate. English config strips stopwords; empty -> skip FTS entirely.
    const orQuery = [...new Set((query.toLowerCase().match(/[a-z0-9]{2,}/g) || []))].slice(0, 24).join(' | ');
    if (query && orQuery) {
      const scopeWhere = project
        ? `((scope='agent' AND scope_id=$2) OR (scope='project' AND scope_id=$3))`
        : `(scope='agent' AND scope_id=$2)`;
      const baseArgs: any[] = project ? [orQuery, agent, project] : [orQuery, agent];
      const conceptRows = (await pool.query(
        `SELECT content, created_at, ts_rank(search_vector, to_tsquery('english', $1)) AS rank
           FROM concepts
          WHERE status='active' AND search_vector @@ to_tsquery('english', $1) AND ${scopeWhere}
          ORDER BY rank DESC LIMIT $${baseArgs.length + 1}`,
        [...baseArgs, limit],
      )).rows;
      for (const r of conceptRows) hits.push({ kind: 'concept', content: r.content, created_at: Number(r.created_at), rank: Number(r.rank) });
      const episodeRows = (await pool.query(
        `SELECT summary AS content, created_at,
                ts_rank(to_tsvector('english', summary), to_tsquery('english', $1))
                  * (0.5 + COALESCE(salience, 0.5)) AS rank
           FROM episodes
          WHERE to_tsvector('english', summary) @@ to_tsquery('english', $1) AND ${scopeWhere}
          ORDER BY rank DESC, created_at DESC LIMIT $${baseArgs.length + 1}`,
        [...baseArgs, limit],
      )).rows;
      for (const r of episodeRows) hits.push({ kind: 'episode', content: r.content, created_at: Number(r.created_at), rank: Number(r.rank) });
      const directiveRows = (await pool.query(
        `SELECT content, created_at,
                ts_rank(to_tsvector('english', content), to_tsquery('english', $1)) AS rank
           FROM directives
          WHERE status='active' AND to_tsvector('english', content) @@ to_tsquery('english', $1) AND ${scopeWhere}
          ORDER BY rank DESC LIMIT $${baseArgs.length + 1}`,
        [...baseArgs, limit],
      )).rows;
      for (const r of directiveRows) hits.push({ kind: 'rule', content: r.content, created_at: Number(r.created_at), rank: Number(r.rank) });
      hits.sort((a, b) => b.rank - a.rank);
      hits.splice(limit);
    }
    const recent = (await pool.query(
      `SELECT summary AS content, created_at FROM episodes
        WHERE scope='agent' AND scope_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [agent, recentN],
    )).rows.map((r) => ({ kind: 'episode', content: r.content, created_at: Number(r.created_at) }));
    // Session-scoped "where we left off" — the current thread's last N episodes
    // (R2). Lets a consumer resume one conversation across tool-turn gaps without
    // re-explaining. Empty when no session_id is passed or the thread is new.
    const recentSession = session
      ? (await pool.query(
          `SELECT summary AS content, created_at FROM episodes
            WHERE scope='agent' AND scope_id=$1 AND session_id=$2
            ORDER BY created_at DESC LIMIT $3`,
          [agent, session, recentN],
        )).rows.map((r) => ({ kind: 'episode', content: r.content, created_at: Number(r.created_at) }))
      : [];
    // The agent's single active "where I am right now" self-summary (R5) — always
    // returned (not FTS-gated) so the consumer can inject it every turn.
    const selfSummary = (await pool.query(
      `SELECT content FROM concepts
        WHERE scope='agent' AND scope_id=$1 AND source_type='self_summary' AND status='active'
        ORDER BY created_at DESC LIMIT 1`,
      [agent],
    )).rows[0]?.content ?? null;
    // Flow telemetry for the Brain screen (fire-and-forget).
    pool.query(
      `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1,$2,$3,$4::jsonb)`,
      [randomUUID(), 'agent_memory_recall', 'agent-memory', JSON.stringify({ agent, q: query.slice(0, 140) || null, hits: hits.length, session: session || null })],
    ).catch(() => undefined);
    return reply.send(ok({ agent, query: query || null, hits, recent, recent_session: recentSession, self_summary: selfSummary }));
  });

  fastify.get('/active-project', async (request, reply) => {
    const q = request.query as { cwd?: string; session_id?: string };
    const result = await resolveActiveProject(pool, {
      cwd: q?.cwd ?? null,
      sessionId: q?.session_id ?? null,
    });
    const hints = result.source === 'none' ? recentProjects() : [];
    return reply.send(ok({ ...result, recent_hints: hints }));
  });

  fastify.post('/active-project', async (request, reply) => {
    const body = (request.body || {}) as { project?: string; subproject?: string; session_id?: string; set_by?: string };
    if (!body.project) return reply.code(400).send(err('INVALID_INPUT', 'project required'));
    try {
      const pin = await setActiveProject(pool, {
        project: body.project,
        subproject: body.subproject ?? null,
        sessionId: body.session_id ?? null,
        setBy: body.set_by ?? null,
      });
      return reply.send(ok({ pinned: pin, message: `Active project pinned to ${pin.project}${pin.subproject ? '/' + pin.subproject : ''} (scope=${pin.scope})` }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(400).send(err('SET_FAILED', message));
    }
  });

  fastify.delete('/active-project', async (request, reply) => {
    const q = request.query as { session_id?: string };
    await clearActiveProject(pool, q?.session_id ?? null);
    return reply.send(ok({ cleared: q?.session_id || '_global' }));
  });

  // ── POST /silo-command — Phase 48.1 /silo CLI slash-command handler ──
  // 127.0.0.1-only; relies on server bind for protection (no auth middleware
  // in this file's route group). Called by ~/.claude/hooks/porter-user-prompt.js
  // when a user types `/silo`, `/silo <name>`, or `/silo none` in any Claude
  // CLI session. UPSERTs into session_silo_overrides; the silo-detector reads
  // that row in the next /context call.
  fastify.post('/silo-command', async (req, reply) => {
    const body = (req.body || {}) as { session_id?: string; command?: string };
    const sessionId = (body.session_id || '').trim();
    const command   = (body.command   || '').trim();

    if (!sessionId) return reply.code(400).send({ ok: false, message: 'session_id required' });
    if (!command.startsWith('/silo')) return reply.code(400).send({ ok: false, message: "command must start with /silo" });

    // Parse: "/silo", "/silo software", "/silo none"
    const arg = command.slice('/silo'.length).trim().toLowerCase();

    // Case A — status query (no argument)
    if (arg === '') {
      const overrideRes = await pool.query(
        `SELECT silo_id, set_at FROM session_silo_overrides
         WHERE session_id = $1 AND set_at > NOW() - INTERVAL '24 hours'`,
        [sessionId],
      );
      if (overrideRes.rowCount && overrideRes.rowCount > 0) {
        const row = overrideRes.rows[0] as { silo_id: string | null };
        if (row.silo_id === null) {
          return reply.send({ ok: true, message: 'Silo override: none (explicitly cleared)', current_silo: null, source: 'override' });
        }
        return reply.send({ ok: true, message: 'Silo override: ' + row.silo_id, current_silo: row.silo_id, source: 'override' });
      }
      return reply.send({ ok: true, message: 'No override set; silo detected from cwd', current_silo: null, source: 'detected' });
    }

    // Case B — explicit clear
    if (arg === 'none') {
      await pool.query(
        `INSERT INTO session_silo_overrides (session_id, silo_id, set_at)
         VALUES ($1, NULL, NOW())
         ON CONFLICT (session_id) DO UPDATE SET silo_id = NULL, set_at = NOW()`,
        [sessionId],
      );
      return reply.send({ ok: true, message: '/silo none — override cleared for this session', current_silo: null, source: 'override' });
    }

    // Case C — set a silo by name. Validate against silos.id
    const siloName = arg;
    const validRes = await pool.query(
      `SELECT id, display_name FROM silos WHERE id = $1 AND enabled = TRUE LIMIT 1`,
      [siloName],
    );
    if (!validRes.rowCount) {
      const availRes = await pool.query(`SELECT id FROM silos WHERE enabled = TRUE ORDER BY id`);
      const avail = (availRes.rows as Array<{id: string}>).map((r) => r.id).join(', ') || '(none enabled)';
      return reply.code(400).send({ ok: false, message: "Unknown silo '" + siloName + "'. Available: " + avail });
    }

    await pool.query(
      `INSERT INTO session_silo_overrides (session_id, silo_id, set_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET silo_id = $2, set_at = NOW()`,
      [sessionId, siloName],
    );

    return reply.send({
      ok: true,
      message: '/silo ' + siloName + ' — override applied for this session',
      current_silo: siloName,
      source: 'override',
    });
  });

  // ── POST /transcript/turn — Phase 48.2 transcript capture ──────────
  // TRC-04 (silo tag), TRC-05 (PII scrub), TRC-07 (/silo none kill switch).
  // 127.0.0.1-only; relies on server bind for protection (no auth middleware
  // in this file's route group — same posture as /silo-command).
  // Called fire-and-forget from porter-user-prompt.js (user role) and
  // porter-stop.js (assistant role) hooks. The handler delegates to
  // insertTurn() which encapsulates the full capture pipeline.
  fastify.post('/transcript/turn', async (req, reply) => {
    const body = (req.body || {}) as {
      session_id?: string;
      cwd?: string | null;
      role?: string;
      content?: string;
      captured_at?: string | null;
    };

    const sessionId = (body.session_id || '').trim();
    const role = (body.role || '').trim();
    const content = body.content ?? '';

    // Phase 48.2 TRC-07: global kill switch (belt-and-braces on top of per-session
    // /silo none override). Default true; flip via env INTELLECT_TRANSCRIPT_CAPTURE_ENABLED=false.
    // Gate runs BEFORE any other validation so a globally disabled instance
    // returns the same neutral shape regardless of input.
    if (!config.intellect.transcriptCaptureEnabled) {
      return reply.send({
        ok: true,
        inserted: false,
        silo: null,
        turn_index: -1,
        skipped: 'disabled',
      });
    }

    if (!sessionId) {
      return reply.code(400).send({ ok: false, message: 'session_id required' });
    }
    if (role !== 'user' && role !== 'assistant') {
      return reply.code(400).send({ ok: false, message: "role must be 'user' or 'assistant'" });
    }

    try {
      const result = await insertTurn(
        {
          session_id: sessionId,
          cwd: body.cwd ?? null,
          role: role as 'user' | 'assistant',
          content,
          captured_at: body.captured_at ?? null,
        },
        pool,
      );
      return reply.send(result);
    } catch (e: unknown) {
      req.log.error({ err: e }, '[transcript/turn] insertTurn failed');
      return reply.code(500).send({ ok: false, message: 'capture failed' });
    }
  });

  // ── POST /transcript/retention-run — Phase 48.2 TRC-06 manual trigger ──
  // Used by the smoke harness + admin "run now" surfaces to validate retention
  // end-to-end without waiting 24h for the scheduled workflow tick. The
  // production retention runs daily via the workflow engine
  // (workflows.action_type='transcript_retain', trigger='every_24h').
  // 127.0.0.1-only; same auth posture as /transcript/turn (relies on server bind).
  fastify.post('/transcript/retention-run', async (req, reply) => {
    try {
      const result = await runTranscriptRetention(pool);
      return reply.send({ ok: true, deleted: result.deleted });
    } catch (e: unknown) {
      req.log.error({ err: e }, '[transcript/retention-run] failed');
      return reply.code(500).send({ ok: false, message: 'retention failed' });
    }
  });

  // ── Phase 48.3 — POST /dream-run manual trigger ──────────────────────
  // 127.0.0.1-only; relies on server bind for protection (no auth middleware
  // in this file's route group — same posture as /silo-command, /transcript/turn,
  // and /transcript/retention-run). The endpoint validates silo + bounds, mints
  // a dream_run_id, fires runDreamWorker via setImmediate (fire-and-forget), and
  // returns 202 with a poll URL. Caller polls GET /dream-runs/:id for status.
  fastify.post('/dream-run', async (req, reply) => {
    const body = (req.body ?? {}) as {
      silo_id?: string;
      model_override?: string;
      sample_size_override?: number;
      triggered_by?: string;
      dry_run?: boolean;
      _mock_response_path?: string;  // SMOKE-TEST-ONLY: per-call mock injection (env vars can't cross HTTP)
    };
    // SAFE DEFAULT (Phase 50 MSF-03): software is the dominant silo; explicit silo_id
    // in the POST body (admin, data-room, future) ALWAYS overrides this fallback.
    const siloId = body.silo_id ?? 'software';

    // Validate silo exists + enabled
    const siloRow = (await pool.query(
      `SELECT id FROM silos WHERE id=$1 AND enabled=true`,
      [siloId],
    )).rows[0];
    if (!siloRow) {
      return reply.code(404).send({ ok: false, code: 'SILO_NOT_FOUND', message: `Silo ${siloId} not found or disabled` });
    }

    // Outer absolute bounds on sample_size_override (Opus ceiling = 2.5MB)
    if (body.sample_size_override != null) {
      if (typeof body.sample_size_override !== 'number' || body.sample_size_override < 1000 || body.sample_size_override > 2_500_000) {
        return reply.code(400).send({ ok: false, code: 'INVALID_SAMPLE_SIZE', message: 'sample_size_override must be a number between 1000 and 2500000 bytes' });
      }
      // Model-aware clamp: Sonnet has a smaller effective context — refuse Opus-sized budgets routed to Sonnet
      if (body.model_override && /sonnet/i.test(body.model_override) && body.sample_size_override > 800_000) {
        return reply.code(400).send({
          ok: false,
          code: 'INVALID_SAMPLE_SIZE_FOR_MODEL',
          message: 'sample_size_override too large for sonnet (max 800000 bytes)',
          max: 800_000,
        });
      }
    }

    // Mint run id now so we can return it immediately
    const dreamRunId = 'dr_' + randomUUID();
    const triggered_by = (body.triggered_by ?? 'manual-trigger');

    // Fire-and-forget — worker runs in background; caller polls GET /dream-runs/:id
    setImmediate(() => {
      runDreamWorker({
        siloId,
        triggeredBy: 'manual',
        triggeredByUser: triggered_by,
        modelOverride: body.model_override,
        sampleSizeOverride: body.sample_size_override,
        dryRun: !!body.dry_run,
        dreamRunIdOverride: dreamRunId,
        mockResponsePath: body._mock_response_path,
      }).catch(workerErr => {
        // Worker logs its own intellect_event + flips dream_runs.status='failed'.
        // We just log here so the failure isn't silent in journald.
        console.error('[dream-run] worker failed:', workerErr instanceof Error ? workerErr.message : workerErr);
      });
    });

    return reply.code(202).send({
      ok: true,
      dream_run_id: dreamRunId,
      status: 'running',
      poll_url: `/api/v1/intellect/dream-runs/${dreamRunId}`,
    });
  });

  // ── Phase 48.3 — GET /dream-runs/:id poll status ─────────────────────
  // 127.0.0.1-only; relies on server bind for protection (no auth middleware
  // in this file's route group — same posture as the POST sibling above).
  fastify.get('/dream-runs/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = (await pool.query(`SELECT * FROM dream_runs WHERE id=$1`, [id])).rows[0];
    if (!row) {
      return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: 'Dream run not found' });
    }
    return reply.send({ ok: true, dream_run: row });
  });

  // ── PR-3 (2026-07-04) — GET /dream-proposals — pending review queue ──
  // Headless review surface for dream-worker output. The admin SPA (the old
  // reviewer UI) was archived in PR-2; this is the pull path for Tom/ymc.
  // Returns pending proposals WITH content (live HTTP response, not a log —
  // the no-model-text rule applies to intellect_events, not to this endpoint).
  // Accept/reject stay on the existing admin API:
  //   POST /api/admin/dreams/proposals/:id/{accept,reject} (platform-admin session).
  // 127.0.0.1-only; relies on server bind for protection (same posture as
  // /dream-run above).
  fastify.get('/dream-proposals', async (req, reply) => {
    const q = req.query as { silo_id?: string; limit?: string };
    const lim = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
    const params: unknown[] = [];
    let where = `status = 'pending'`;
    if (q.silo_id) { params.push(q.silo_id); where += ` AND silo_id = $${params.length}`; }
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
              proposed_content, proposed_metadata, sort_order, created_at, expires_at
         FROM memory_proposals
        WHERE ${where}
        ORDER BY expires_at ASC NULLS LAST, sort_order ASC
        LIMIT $${params.length}`,
      params,
    );
    return reply.send(ok({ proposals: rows, count: rows.length }));
  });

  // ── PR-3 — POST /dream-review-digest — run the daily digest manually ─
  // Same manual-trigger pattern as POST /prune. Writes ONE
  // 'dream_proposals_pending' intellect_events row (when pending > 0) and
  // returns the summary. The scheduled path is the 'Daily dream-proposal
  // review digest' every_24h workflow.
  fastify.post('/dream-review-digest', async (_request, reply) => {
    try {
      const result = await runDreamProposalsReviewDigest();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('DREAM_REVIEW_DIGEST_FAILED', message));
    }
  });

  // ── POST /session-end — session finished, create episode ────────────

  fastify.post('/session-end', async (request, reply) => {
    const body = request.body as {
      sessionId?: string;
      project?: string | null;
      gateway?: string | null;
    };
    if (!body?.sessionId) {
      return reply.status(400).send(err('BAD_REQUEST', 'sessionId required'));
    }
    try {
      // Direct call AND emit the event — so any other workflows listening
      // for session.end also fire.
      const episode = await analyzeAndStoreSession({
        sessionId: body.sessionId,
        project: body.project ?? null,
        gateway: body.gateway ?? null,
      });
      emitEvent('session.end', {
        sessionId: body.sessionId,
        project: body.project ?? null,
        gateway: body.gateway ?? null,
      }).catch(e => console.error('[intellect:session-end] event emit failed:', e));

      // Universal memory R1: session-end is the ONE default write path for hot
      // context (council design — keeps memory from being polluted by ad-hoc
      // writes from every CLI). Every gateway that ends a session warms the
      // cache for the next one, whichever CLI that turns out to be.
      // Non-fatal: never fail a session-end because the cache didn't recompute.
      let hot: unknown = null;
      if (body.project) {
        try {
          const { recomputeHot } = await import('../../services/intellect/hot-context.js');
          hot = await recomputeHot({
            project: body.project,
            sessionId: body.sessionId,
            gateway: body.gateway ?? null,
          });
        } catch (e) {
          console.error('[intellect:session-end] hot recompute failed:', e);
        }
      }
      return reply.send(ok({ episode, hot }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('SESSION_END_FAILED', message));
    }
  });

  // ── Universal memory R1: HOT CONTEXT (warm session bootstrap) ────────
  // The cheap packet a session opens with, so it doesn't re-derive the project
  // from zero. See planning/porter-universal-memory-37.md. Read path is
  // fail-open: a fresh Porter returns COLD and the CLI still boots fine.

  // GET /hot?project=&scope= — the warm packet (or an honest cold response).
  fastify.get('/hot', async (request, reply) => {
    const q = request.query as { project?: string; scope?: string };
    if (!q?.project) return reply.status(400).send(err('BAD_REQUEST', 'project required'));
    const { getHot, safeProjectDir } = await import('../../services/intellect/hot-context.js');
    // `project` becomes a filesystem path — reject traversal at the boundary too.
    if (!safeProjectDir(q.project)) return reply.status(400).send(err('BAD_REQUEST', 'invalid project'));
    return reply.send(ok(await getHot(q.project, q.scope ?? 'default')));
  });

  // POST /hot/recompute — force a rebuild (session-end does this automatically).
  fastify.post('/hot/recompute', async (request, reply) => {
    const body = (request.body ?? {}) as { project?: string; scope?: string; gateway?: string | null };
    if (!body?.project) return reply.status(400).send(err('BAD_REQUEST', 'project required'));
    try {
      const { recomputeHot, safeProjectDir } = await import('../../services/intellect/hot-context.js');
      if (!safeProjectDir(body.project)) return reply.status(400).send(err('BAD_REQUEST', 'invalid project'));
      return reply.send(ok(await recomputeHot({
        project: body.project, scope: body.scope, gateway: body.gateway ?? null,
      })));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('HOT_RECOMPUTE_FAILED', message));
    }
  });

  // ── POST /promote — run the memory promoter manually ────────────────

  fastify.post('/promote', async (_request, reply) => {
    try {
      const result = await runMemoryPromotion();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('PROMOTE_FAILED', message));
    }
  });

  // ── POST /score-dispatches — run dispatch scorer manually ───────────

  fastify.post('/score-dispatches', async (_request, reply) => {
    try {
      const result = await runDispatchScoring();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('SCORE_FAILED', message));
    }
  });

  // ── POST /prune — run memory pruner ─────────────────────────────────

  fastify.post('/prune', async (_request, reply) => {
    try {
      const result = await runMemoryPruning();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('PRUNE_FAILED', message));
    }
  });

  // ── POST /vault-index — run the vault→concepts indexer manually ─────
  //
  // Memory-unification U2 (same manual-trigger pattern as /prune). Scans
  // vault concepts/+entities/ into `concepts` rows (source_type='vault').
  // Scheduled path: 'Index vault concepts daily' every_24h workflow.
  fastify.post('/vault-index', async (_request, reply) => {
    try {
      const result = await runVaultIndexing();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('VAULT_INDEX_FAILED', message));
    }
  });

  // ── POST /claude-rules-mirror — mirror Claude session rules manually ─
  //
  // Memory-unification U6 (same manual-trigger pattern as /vault-index).
  // Parses /home/lobster/CLAUDE.md hard rules + project CLAUDE.md
  // non-negotiables into ONE workspace directive (supersedes its prior row,
  // hash-idempotent). Scheduled path: 'Mirror Claude session rules'
  // every_24h workflow.
  fastify.post('/claude-rules-mirror', async (_request, reply) => {
    try {
      const result = await runClaudeRulesMirror();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('CLAUDE_RULES_MIRROR_FAILED', message));
    }
  });

  // ── POST /failure-digest — run the ymc failure-digest collector manually ─
  //
  // Rule-distillation loop (vault/concepts/rule-distillation-loop.md); same
  // manual-trigger pattern as /prune and /vault-index. Fetches ymc's
  // GET /api/v1/admin/tom/failure-digest, appends ONE failure_digest
  // intellect_event (counts + ≤20 snippets). Scheduled path: 'Distill ymc
  // failure digest' every_24h workflow. body: { hours?: number } (default 24).
  fastify.post('/failure-digest', async (request, reply) => {
    try {
      const hours = Number((request.body as { hours?: number } | null)?.hours ?? 24);
      const result = await runFailureDigestDistill(
        Number.isFinite(hours) && hours > 0 ? hours : 24,
      );
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('FAILURE_DIGEST_FAILED', message));
    }
  });

  // ── POST /worker-knowledge-refresh — run the worker researcher manually ─
  //
  // Worker knowledge-evolution loop (vault/concepts/worker-knowledge-loop.md);
  // same manual-trigger pattern as /failure-digest. body: { worker?: string }
  // pins a worker (e.g. "marshall"); omitted = round-robin next due. Dispatch
  // is FORCED to the cheap gateway. Scheduled path: 'Refresh worker knowledge'
  // every_24h workflow.
  fastify.post('/worker-knowledge-refresh', async (request, reply) => {
    try {
      const worker = (request.body as { worker?: string } | null)?.worker;
      const result = await runWorkerKnowledgeRefresh({
        triggeredBy: 'manual',
        worker: typeof worker === 'string' && worker.trim() ? worker.trim() : undefined,
      });
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('WORKER_KNOWLEDGE_REFRESH_FAILED', message));
    }
  });

  // ── POST /github-scan — run the watchlist scanner manually ──────────
  //
  // Same loop; zero-LLM gh diff + cheap-gateway summary only on change.
  // Manual runs bypass the weekly state-file floor. Scheduled path:
  // 'Scan GitHub watchlist' every_24h workflow.
  fastify.post('/github-scan', async (_request, reply) => {
    try {
      const result = await runGithubScan({ triggeredBy: 'manual' });
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('GITHUB_SCAN_FAILED', message));
    }
  });

  // ── GET /health — Intellect self-monitor snapshot ──────────────────

  fastify.get('/health', async (_request, reply) => {
    try {
      const snapshot = await runSelfMonitor();
      return reply.send(ok(snapshot));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('SELF_MONITOR_FAILED', message));
    }
  });

  // ── GET /patterns — pattern miner output ────────────────────────────

  fastify.get('/patterns', async (_request, reply) => {
    try {
      const result = await runPatternMining();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('PATTERN_MINE_FAILED', message));
    }
  });

  // ── POST /detect-tools — run tool detection scan ────────────────────

  fastify.post('/detect-tools', async (_request, reply) => {
    try {
      const result = await runToolDetection();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('TOOL_DETECTION_FAILED', message));
    }
  });

  // ── POST /check-subscriptions — fetch external sources ─────────────

  fastify.post('/check-subscriptions', async (_request, reply) => {
    try {
      const result = await runSubscriptionCheck();
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('SUBSCRIPTION_CHECK_FAILED', message));
    }
  });

  // ── GET /episodes — recent session episodes ─────────────────────────

  fastify.get('/episodes', async (request, reply) => {
    const { project, limit = '20' } = request.query as { project?: string; limit?: string };
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const { rows } = project
      ? await pool.query(
          `SELECT id, scope, scope_id, session_id, gateway, summary,
                  corrections_json, files_changed_json, duration_seconds, created_at
           FROM episodes
           WHERE scope_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [project, lim]
        )
      : await pool.query(
          `SELECT id, scope, scope_id, session_id, gateway, summary,
                  corrections_json, files_changed_json, duration_seconds, created_at
           FROM episodes
           ORDER BY created_at DESC
           LIMIT $1`,
          [lim]
        );
    return reply.send(ok({ episodes: rows, count: rows.length }));
  });

  // ── GET /stats — Intellect system stats ──────────────────────────────

  fastify.get('/stats', async (_request, reply) => {
    const { rows: memStats } = await pool.query<{
      total: string;
      valid: string;
      broken: string;
      stale: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'valid')::text AS valid,
         COUNT(*) FILTER (WHERE status = 'broken')::text AS broken,
         COUNT(*) FILTER (WHERE status = 'stale')::text AS stale
       FROM memory_references`
    );

    const { rows: eventStats } = await pool.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM intellect_events
       WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 86400
       GROUP BY event_type`
    );

    const { rows: episodeCount } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM episodes`
    );

    const { rows: candidateCount } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM directives WHERE status = 'candidate'`
    );

    const { rows: activeDirectives } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM directives WHERE status = 'active'`
    );

    const { rows: workflowStats } = await pool.query<{
      total: string;
      enabled: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE enabled = true)::text AS enabled
       FROM workflows`
    );

    return reply.send(ok({
      references: memStats[0] || { total: '0', valid: '0', broken: '0', stale: '0' },
      events24h: eventStats,
      episodes: parseInt(episodeCount[0]?.count || '0', 10),
      candidates: parseInt(candidateCount[0]?.count || '0', 10),
      activeDirectives: parseInt(activeDirectives[0]?.count || '0', 10),
      workflows: {
        total: parseInt(workflowStats[0]?.total || '0', 10),
        enabled: parseInt(workflowStats[0]?.enabled || '0', 10),
      },
    }));
  });
}
