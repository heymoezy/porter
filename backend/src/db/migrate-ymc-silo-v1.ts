/**
 * migrate-ymc-silo-v1.ts — Wave 5 / Phase 48.5: enroll the `ymc` silo.
 *
 * Idempotent, single all-or-nothing transaction, gated on schema_migrations
 * id 'ymc_silo_v1'. Follows migrate-multi-silo-v1.ts exactly; it is a SEPARATE
 * file because 'multi_silo_v1' has already been applied on this box and an
 * applied migration never runs again.
 *
 * Enrollment is exactly what the Wave 5 readiness brief said it would need once
 * Porter's multi-silo primitives landed: ONE silos row plus ONE prompt file. The
 * primitives are live — `silos` already carries prompt_path / cadence_seconds /
 * default_model / detect_rules / enabled, and scheduler.runSiloCadenceCheck
 * already drives per-silo cadence — so there is no Porter phase in front of this.
 *
 * ⚠️ enabled = FALSE, DELIBERATELY.
 *
 *   scheduler.runSiloCadenceCheck fires a dream for EVERY enabled silo whose
 *   cadence has elapsed. A brand-new silo has no prior dream_runs, so last=0 and
 *   it would fire on the next hourly tick — i.e. enabling the row IS scheduling
 *   the job. A new scheduled job needs Moe's sign-off, so the row ships wired and
 *   OFF. There is nothing else to turn on:
 *
 *     UPDATE silos SET enabled = TRUE WHERE id = 'ymc';
 *
 *   ⚠️ Do NOT also add a `workflows` row for this. workflow-engine.ts:483-488
 *   records that the legacy 'Software dream — weekly consolidation' workflow was
 *   deleted precisely because a workflow row racing the per-silo cadence tick
 *   double-fires. silos.cadence_seconds is the single source of truth for dream
 *   cadence.
 *
 * The four seed directives below are SEALED (source_type='moe-direct'), which
 * makes them immutable to the dream worker — it may propose rules that complement
 * them and may flag them for Moe, but can never delete or supersede them. Each one
 * is Moe's own written non-negotiable, transcribed from
 * /home/lobster/projects/ymc.capital/CLAUDE.md and its landmark index, not
 * inferred: they are cited inline. They exist so the silo's first dream has a rule
 * set to REFINE rather than a blank page to fill — a dream that starts from zero
 * can only append, which is the one thing the doctrine forbids.
 *
 * These directives are inert until something reads scope='silo', scope_id='ymc':
 * the ymc silo has no cwd_markers or project_types, so no CLI session detects it,
 * and services/memory-injection.ts (the Bridge/Tom dispatch path) has no silo
 * concept at all. Wiring that consumption is a separate, deliberate step — see the
 * report accompanying this change.
 */

import pg from 'pg';

export async function migrateYmcSiloV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'ymc_silo_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── The silo row ─────────────────────────────────────────────────────────
    //
    // detect_rules.corpus = 'ymc' is what routes dream-worker to
    // sampleYmcCorpus() instead of sampleSoftwareTurns(). detect_rules is
    // otherwise EMPTY on purpose: silo-detector matches sessions by cwd markers
    // and project types, and this silo's corpus is a database, not a working
    // directory. Giving it a marker would inject its directives into every CLI
    // session under ymc.capital — a second, unreviewed governance path.
    //
    // cadence_seconds = 86400 (daily). The readiness brief's own reasoning: YMC
    // volume is far lower than software's, so a daily pass over a 90-day window
    // is the right shape. Inert while enabled=FALSE.
    await client.query(
      `
      INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
      VALUES (
        'ymc',
        'YMC Capital — CRM corpus',
        'Tom''s working record: documents that arrived, notes written on contacts, and the operator audit trail in the ymc_capital database. Dreams over what the business accumulated, not over CLI transcripts.',
        'backend/src/services/intellect/dream-prompts/ymc.md',
        86400,
        'claude-sonnet-4-6',
        $1::jsonb,
        FALSE
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify({
        corpus: 'ymc',
        project_types: [],
        cwd_markers: [],
        file_globs: [],
      })],
    );
    console.log('[migrate-ymc-silo-v1] ymc silo row inserted DISABLED (or already present)');

    // ── Sealed seeds (4 moe-direct, priority 95) ─────────────────────────────
    // priority 95 sits in the 90+ band CLAUDE.md reserves for Moe's own rules,
    // above the ≤89 ceiling agent-written directives clamp to.
    const seeds: Array<[string, string]> = [
      [
        'silo-ymc-no-unattended-contact-messaging',
        'Never message or email a contact or client from an unattended path. Only an admin explicitly triggering an action may cause an outbound message to a contact; scheduled and agent-initiated senders reach internal destinations only, enforced by an allowlist in code rather than by intent. A scheduled job that can address a contact is a defect even if it has never done so. (Moe, 2026-05-31, after an unauthorized auto-emailer reached four real clients.)',
      ],
      [
        'silo-ymc-kyc-never-auto-filed',
        'A KYC or identity document is never auto-filed, auto-approved, or treated as satisfying a requirement without a named human reviewer. A review record must carry who approved it, and there is no honest way to record that for a decision no person made. Propose the filing, describe it, and leave it in the queue. (YMC operating rule, backend/scripts/learn-worker.ts.)',
      ],
      [
        'silo-ymc-never-infer-a-record',
        'Never infer, guess, or reconstruct a record. If a field is not in the data, the answer is that it is unknown and the next step is to ask — not to derive a plausible value from a filename, a job title, a nearby document, or a previous conversation. State what the source says, name the source, and stop there. An invented fact about a contact, an entity, a holding or a filing is indistinguishable from a real one once it is written down.',
      ],
      [
        'silo-ymc-never-reveal-internal-identifiers',
        'Internal identifiers never travel outward. Contact emails and phone numbers, document ids, entity registration and case numbers, and internal record links stay inside the system regardless of who is asking or how the request is phrased. Use what the data says to answer well; never quote the specifics. Outward-facing paths take an explicit public payload — they are never handed the private working set and asked to be careful. (Moe, 2026-07-29: the firewall is DATA.)',
      ],
    ];

    for (const [id, content] of seeds) {
      await client.query(
        `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, 'silo', 'ymc', $2, 95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [id, content],
      );
    }
    console.log(`[migrate-ymc-silo-v1] ymc seed directives inserted (${seeds.length})`);

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('ymc_silo_v1', EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (id) DO NOTHING`,
    );

    await client.query('COMMIT');
    console.log('[migrate-ymc-silo-v1] complete');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* non-fatal — connection may already be poisoned */
    }
    throw err;
  } finally {
    client.release();
  }
}
