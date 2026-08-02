/**
 * measure-concept-duplication.ts — is corpus-wide concept dedup worth building?
 *
 * ⚠️ THE ANSWER, ON THIS CORPUS, IS NO. Run this before building any similarity-
 * based dedup, and read what it prints rather than the headline count.
 *
 * The R7 Stage B blocker was written as: *"Porter does not dedup concepts the
 * way it dedups directives, so a paraphrase arriving by another path still
 * stacks. Fix that first or Stage B trades one mess for another."* Once R6 put
 * embeddings on `concepts`, that looked one query away. It is not.
 *
 * Measured 2026-08-02 over 216 active concepts, splitting the pairs by whether
 * they are structurally similar BY DESIGN:
 *
 *     cosine >= 0.97   16 pairs — 16 structural,  0 real duplicates
 *     cosine >= 0.93   36 pairs — 36 structural,  0 real duplicates
 *     cosine >= 0.88   54 pairs — 52 structural,  2 real duplicates
 *
 * Above 0.93 there is not a single genuine duplicate — every pair is two
 * distinct records that merely read alike:
 *   · `[Ollama releases] v0.32.2-rc2` vs `v0.32.2-rc0` — sim 0.989. DISTINCT
 *     release records. Embeddings barely move on a version number, so a whole
 *     class of short structured records sits at the top of the similarity band.
 *   · `Worker — Quill (insights)` vs `Worker — Rolo (CRM)` — sim 0.886. Different
 *     workers sharing the boilerplate "Tom's FUNCTIONAL worker for …".
 *
 * The two REAL duplicates only appear once the threshold drops to 0.88 — the BYD
 * JLL sell-side mandate stated twice, and the "sold the entity" director/
 * shareholder rule stated twice. To catch them automatically you must accept
 * **52 false positives for 2 true ones, a 26:1 ratio**, and those false
 * positives are real release history and distinct worker cards.
 *
 * **Deleting real records to merge two duplicated sentences is a bad trade.** It
 * is the same shape as the 2026-07-31 incident where re-keying vault docs ran
 * into a deliberate dedup design and produced 2,100 duplicates.
 *
 * If dedup is ever needed, do it at WRITE time, scoped to one writer and its own
 * prior output (the distiller rewording its own curiosities is the only known
 * stacking path, and it already archives last night's copies) — never as a
 * corpus-wide similarity sweep.
 */
import { pool } from '../src/db/client.js';

const THRESHOLDS = [0.97, 0.93, 0.88];

/** Records that are STRUCTURALLY similar by design and must not be merged. */
const STRUCTURAL = /^\[[^\]]*releases\]|^Worker — /;

async function main(): Promise<void> {
  const total = (await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM concepts WHERE status='active'`)).rows[0].n;
  const embedded = (await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM concepts WHERE status='active' AND embedding IS NOT NULL`)).rows[0].n;
  console.log(`Concept duplication — ${embedded}/${total} active concepts embedded\n`);

  for (const t of THRESHOLDS) {
    const { rows } = await pool.query<{ a: string; b: string; sim: string }>(
      `SELECT a.content AS a, b.content AS b,
              round((1 - (a.embedding <=> b.embedding))::numeric, 3)::text AS sim
         FROM concepts a
         JOIN concepts b
           ON a.id < b.id AND a.scope = b.scope
          AND COALESCE(a.scope_id,'') = COALESCE(b.scope_id,'')
        WHERE a.status='active' AND b.status='active'
          AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
          AND 1 - (a.embedding <=> b.embedding) >= $1
        ORDER BY 3 DESC`, [t]);
    const structural = rows.filter((r) => STRUCTURAL.test(r.a) || STRUCTURAL.test(r.b)).length;
    console.log(`cosine >= ${t}: ${rows.length} pair(s) — ${structural} are structurally-similar-by-design ` +
      `(release records / worker cards), ${rows.length - structural} candidate real duplicate(s)`);
    for (const r of rows.filter((x) => !STRUCTURAL.test(x.a) && !STRUCTURAL.test(x.b)).slice(0, 5)) {
      console.log(`    sim=${r.sim}\n      A: ${r.a.replace(/\s+/g, ' ').slice(0, 96)}\n      B: ${r.b.replace(/\s+/g, ' ').slice(0, 96)}`);
    }
  }

  console.log('\nRead the pairs, not the count. A threshold low enough to catch the real');
  console.log('duplicates also merges distinct release records. Do NOT build a corpus-wide');
  console.log('similarity sweep on this evidence — see the header of this file.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
