/**
 * R3 — import the review decisions ymc ALREADY has. Never make Moe review the same document twice.
 *
 * Moe: don't make him redo the review queues — ymc's has handled a lot of this already.
 *
 * ymc_capital.document_reviews holds his real decisions (462 rows / 460 documents, all 'approved',
 * all reviewed by him). Meanwhile those same documents were sitting in the vault's queue as
 * `proposed`, waiting to be reviewed a SECOND time, by the same person, for the same documents.
 *
 * The join is EXACT, not fuzzy: `vault_artifacts.source_id` (kind='db_entity',
 * source_system='ymc_capital') IS `ymc_capital.documents.id`. No name matching, no guessing.
 *
 * Idempotent and safe to re-run: it only touches placements still in `proposed`, and it refuses to
 * activate a node that already has an active placement in the same layer (the one-active-per-node
 * invariant). Attribution is the REAL reviewer from ymc — never "system", never me.
 *
 *   npx tsx scripts/import-ymc-review-decisions.ts [--dry]
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

const dry = process.argv.includes('--dry');

const porter = new Pool({ connectionString: process.env.DATABASE_URL });
// ymc's DATABASE_URL — read from ITS env, never hardcoded here (Porter architecture rule 2).
function ymcDsn(): string {
  if (process.env.YMC_DATABASE_URL) return process.env.YMC_DATABASE_URL;
  try {
    const env = readFileSync('/home/lobster/projects/ymc.capital/backend/.env', 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  throw new Error('ymc DATABASE_URL not found — set YMC_DATABASE_URL or ensure ymc.capital/backend/.env exists');
}
const ymc = new Pool({ connectionString: ymcDsn() });

async function main() {
  // 1. The decisions Moe actually made, latest per document.
  const { rows: decisions } = await ymc.query<{ document_id: string; reviewer: string }>(`
    SELECT DISTINCT ON (r.document_id)
           r.document_id,
           COALESCE(u.display_name, u.email, 'admin') AS reviewer
      FROM document_reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
     WHERE r.decision = 'approved'
     ORDER BY r.document_id, r.created_at DESC
  `);
  console.log(`[import] ${decisions.length} approved documents in ymc's review queue`);
  if (decisions.length === 0) return;

  const ids = decisions.map((d) => d.document_id);
  const reviewerOf = new Map(decisions.map((d) => [d.document_id, d.reviewer]));

  // 2. Which of those are still sitting UNREVIEWED in the vault queue?
  const { rows: pending } = await porter.query<{ placement_id: string; source_id: string; title: string }>(
    `SELECT p.id AS placement_id, a.source_id, n.title
       FROM vault_placements p
       JOIN vault_artifacts a ON a.node_id = p.node_id
       JOIN vault_nodes n     ON n.id      = p.node_id
      WHERE p.app_scope = 'ymc'
        AND a.app_scope = 'ymc'
        AND a.kind = 'db_entity'
        AND a.source_system = 'ymc_capital'
        AND a.source_id = ANY($1::text[])
        AND p.state = 'proposed'
        -- never create a second active placement for the same node+layer
        AND NOT EXISTS (
          SELECT 1 FROM vault_placements ap
           WHERE ap.app_scope = 'ymc' AND ap.node_id = p.node_id
             AND ap.layer = p.layer AND ap.state = 'active'
        )`,
    [ids],
  );

  console.log(`[import] ${pending.length} of them are still queued for review in the vault`);
  if (dry) {
    for (const r of pending.slice(0, 5)) {
      console.log(`   would accept: ${r.title.slice(0, 52)} (reviewed by ${reviewerOf.get(r.source_id)})`);
    }
    console.log('[import] DRY-RUN — nothing written.');
    return;
  }

  let n = 0;
  for (const r of pending) {
    await porter.query(
      `UPDATE vault_placements
          SET state = 'active', reviewed_by = $1, reviewed_at = extract(epoch from now())
        WHERE id = $2 AND state = 'proposed'`,
      [reviewerOf.get(r.source_id) ?? 'admin', r.placement_id],
    );
    n++;
  }
  console.log(`[import] accepted ${n} placements using decisions Moe had ALREADY made.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await porter.end(); await ymc.end(); });
