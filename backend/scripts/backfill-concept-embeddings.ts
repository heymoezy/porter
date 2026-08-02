/**
 * backfill-concept-embeddings.ts — give existing concepts a vector.
 *
 * Re-runnable and incremental: it only ever selects `embedding IS NULL`, so
 * running it twice is a no-op and a nightly insert is picked up by the next run.
 *
 * ⚠️ Content-addressed, not time-addressed. A concept whose text is EDITED keeps
 * a stale embedding, because nothing here can tell an edit from an insert. Pass
 * `--reembed` to rebuild every row when the text or the model changes. Silently
 * serving a vector for text that no longer exists is the failure mode worth
 * naming, since the row still returns — just for the wrong reason.
 *
 *   npx tsx scripts/backfill-concept-embeddings.ts [--apply] [--reembed] [--limit=N]
 *
 * Dry-run by default.
 */
import { pool } from '../src/db/client.js';
import { embedBatch, toVectorLiteral } from '../src/services/intellect/embeddings.js';

const APPLY = process.argv.includes('--apply');
const REEMBED = process.argv.includes('--reembed');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;

/** Ollama handles this comfortably in one call and it bounds a failure's blast radius. */
const BATCH = 32;

async function main(): Promise<void> {
  const { rows } = await pool.query<{ id: string; content: string }>(
    `SELECT id, content FROM concepts
      WHERE status = 'active' ${REEMBED ? '' : 'AND embedding IS NULL'}
        AND content IS NOT NULL AND length(trim(content)) > 0
      ORDER BY created_at ASC ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
  );

  console.log(`${rows.length} concept(s) to embed${REEMBED ? ' (RE-EMBED: all active rows)' : ''}` +
    `${APPLY ? '' : '   (DRY RUN — nothing written)'}`);
  if (!rows.length) { console.log('Nothing to do.'); return; }

  let done = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vecs = await embedBatch(slice.map((r) => r.content));
    for (const [j, r] of slice.entries()) {
      const v = vecs[j];
      if (!v) {
        failed++;
        // Left NULL on purpose — the row stays findable by FTS and the next run
        // retries it. A zero vector would be worse than nothing: it is a real
        // point in the space and would match things at random.
        continue;
      }
      if (APPLY) {
        await pool.query(`UPDATE concepts SET embedding = $2::vector WHERE id = $1`,
          [r.id, toVectorLiteral(v)]);
      }
      done++;
    }
    console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length} · embedded ${done} · failed ${failed}`);
  }

  console.log(`\nembedded ${done} · failed ${failed}${APPLY ? ' (written)' : ' (dry run)'}`);
  if (failed) console.log('Failed rows stay NULL and are retried next run; they remain findable by FTS.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
