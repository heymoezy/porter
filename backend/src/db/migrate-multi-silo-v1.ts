/**
 * migrate-multi-silo-v1.ts — Phase 50 Multi-Silo Foundation
 *
 * Idempotent migration for the multi-silo seed work. Single all-or-nothing
 * transaction. If any step fails, the entire migration rolls back.
 *
 * Plan 50-01 (this plan):
 *   - DELETE legacy workflow row 'Software dream — weekly consolidation'.
 *     The per-silo cadence tick in scheduler.ts (runSiloCadenceCheck) replaces
 *     it. Keeping both would race; the skip-recent guard would dedup but logs
 *     get noisy. Single source of truth = silos.cadence_seconds.
 *   - INSERT schema_migrations row 'multi_silo_v1' as the final statement.
 *
 * Plan 50-02 will add:
 *   - INSERT silos row id='admin'
 *   - INSERT 4 directives at scope='silo', scope_id='admin', source_type='moe-direct'
 *
 * Plan 50-03 will add:
 *   - INSERT silos row id='data-room'
 *   - INSERT 5 directives at scope='silo', scope_id='data-room', source_type='moe-direct'
 *
 * All silo + directive INSERTs use ON CONFLICT (id) DO NOTHING so partial
 * historical runs (smoke tests, ad-hoc inserts) are tolerated.
 *
 * Post-migration: backend/src/index.ts calls loadSiloCache(pool) AFTER this
 * migration, so the new silo rows are picked up by the silo-detector cache
 * without a service restart on the first boot after deployment.
 */

import pg from 'pg';

export async function migrateMultiSiloV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'multi_silo_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Admin silo row ────────────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
      VALUES (
        'admin',
        'Admin & Platform Operations',
        'Porter admin pages, audit hygiene, RBAC posture, review-surface workflows. Internal operator work, not product code.',
        'backend/src/services/intellect/dream-prompts/admin.md',
        259200,
        'claude-sonnet-4-6',
        $1::jsonb,
        TRUE
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify({
        project_types: [],
        cwd_markers: ['.admin-silo'],
        file_globs: [],
      })],
    );
    console.log('[migrate-multi-silo-v1] admin silo row inserted (or already present)');

    // ── Admin silo seed directives (4 moe-direct, priority 95) ────────────────
    const adminSeeds: Array<[string, string]> = [
      [
        'silo-admin-audit-events-transactional',
        'Audit-event writes MUST happen inside the same transaction as the mutation they describe. If an accept/reject/edit handler writes to a primary table (directives, proposals, users), the corresponding audit_event INSERT goes in the same BEGIN/COMMIT block. A failed mutation that leaves an audit row is a worse bug than a failed mutation with no audit row.',
      ],
      [
        'silo-admin-rbac-platform-admin-guard',
        'Every admin route MUST go through requirePlatformAdmin (or equivalent capability check) at the handler entry. Never rely on UI-side route gating alone. If a route mutates platform state (users, silos, workflows, directives, proposals), the auth check is non-negotiable. Workspace-scoped reads can use basic-auth; mutations need admin cap.',
      ],
      [
        'silo-admin-sse-post-commit-only',
        'SSE broadcasts (proposals:created, proposals:resolved, dreams:run-completed, etc.) MUST fire AFTER the database COMMIT. Never broadcast inside a transaction — a rollback after a broadcast leaves connected clients with phantom state. Wrap the broadcast in its own try/catch so a broadcast failure cannot mask the original mutation error.',
      ],
      [
        'silo-admin-review-surface-confirms-before-bulk',
        'Bulk operations on the review surface (bulk accept, bulk reject, bulk archive) MUST show a confirmation modal with the count of affected rows BEFORE the mutation fires. The modal copy names the action verb and the count ("Accept 12 proposals?"). No silent bulk-mutations — Moe must always have a one-keypress veto path. Single-row actions can skip confirmation.',
      ],
    ];

    for (const [id, content] of adminSeeds) {
      await client.query(
        `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, 'silo', 'admin', $2, 95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [id, content],
      );
    }
    console.log(`[migrate-multi-silo-v1] admin seed directives inserted (${adminSeeds.length})`);

    // ── Data-room silo row ────────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
      VALUES (
        'data-room',
        'Data Room & Fund Operations',
        'KYC, deal-flow, investor docs, workout files, exhibits, regulatory submissions. Document-handling work, not code.',
        'backend/src/services/intellect/dream-prompts/data-room.md',
        604800,
        'claude-sonnet-4-6',
        $1::jsonb,
        TRUE
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify({
        project_types: [],
        cwd_markers: ['.data-room-silo'],
        file_globs: [],
      })],
    );
    console.log('[migrate-multi-silo-v1] data-room silo row inserted (or already present)');

    // ── Data-room silo seed directives (5 moe-direct, priority 95) ────────────
    const dataRoomSeeds: Array<[string, string]> = [
      [
        'silo-dataroom-no-synthetic-exhibits',
        `Case-file exhibits, regulatory submissions, and investor-facing documents are PRIMARY SOURCE PDFs only. Never re-render, restyle, regenerate, add cover pages, or compose framing pages onto an exhibit. Synthesized work product (memos, analyses, summaries) goes under Working_Papers/ or research/ and is labelled as derivative. Treat any user request to "clean up" or "reformat" an exhibit as a tripwire — the answer is almost always "use the original".`,
      ],
      [
        'silo-dataroom-audit-primary-sources',
        `Every factual claim in a data-room artifact MUST cite a primary source by file path. Never assert dates, dollar amounts, party names, signing parties, jurisdictional facts, or regulatory status from memory. If the primary source is not readable from the data-room, ASK Moe for the source. "Synthesizing the gist" is a worse failure than asking. The audit trail starts with a citation, not a confident sentence.`,
      ],
      [
        'silo-dataroom-confidentiality-no-leaks',
        `Data-room work is confidential by default. Never paste investor names, fund details, deal terms, KYC PII, or regulatory submission content into commits, public chat surfaces, or non-private logs. When extracting signals or capturing transcripts, redact specific identifiers. Confidentiality posture is asymmetric: a leak is irreversible; an over-redaction is recoverable. Err toward over-redaction.`,
      ],
      [
        'silo-dataroom-regulatory-filer-profile',
        `Regulatory submissions (IRS, SEC, bank, KYC, AML) MUST use Moe's filer profile from memory (Mohamed Ibrahim, US person, NJ address per the user_filer_profile memory). Never invent a surname, SSN, address, or tax ID. SSNs and other secrets are ask-per-filing — not stored. Cross-check entity names against the canonical entity registry before submission; "the LLC" is never a specific enough identifier.`,
      ],
      [
        'silo-dataroom-strategic-communication-guarded',
        `When drafting communications about data-room subjects (legal recovery, fund operations, investor due diligence), follow the strategic-communication posture from memory: short demands to targets, guarded with allies. Get more than you give. Never reveal the full hand. Drafts default to under-disclosing — Moe expands if more is needed, but cannot un-disclose what is already been sent.`,
      ],
    ];

    for (const [id, content] of dataRoomSeeds) {
      await client.query(
        `INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, 'silo', 'data-room', $2, 95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [id, content],
      );
    }
    console.log(`[migrate-multi-silo-v1] data-room seed directives inserted (${dataRoomSeeds.length})`);

    // ── DELETE legacy workflow row (per-silo cadence tick replaces it) ──────
    const deleteResult = await client.query(
      `DELETE FROM workflows WHERE name = 'Software dream — weekly consolidation'`,
    );
    console.log(
      `[migrate-multi-silo-v1] deleted ${deleteResult.rowCount ?? 0} legacy workflow row(s) (Software dream — weekly consolidation)`,
    );

    // ── Record migration ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('multi_silo_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-multi-silo-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
