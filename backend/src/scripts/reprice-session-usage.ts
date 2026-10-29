/**
 * Re-price historical session_usage rows against the corrected RATES table.
 *
 * Why: claude-opus-5 / claude-fable-5 (and 4.6/4.7) had no entry in RATES, so
 * every session on those models fell back to the Sonnet mid rate and was
 * understated — opus-5 by 1.67x, fable-5 by 3.33x.
 *
 * Tokens are exact and untouched. Only the derived cost estimate is recomputed,
 * through the SAME estimateCostUsd() the live path uses — one source of truth.
 *
 * Run: npx tsx src/scripts/reprice-session-usage.ts [--apply]
 * Without --apply it is a dry run and writes nothing.
 */
import { pool } from '../db/client.js';
import { estimateCostUsd } from '../services/intellect/cost-metrics.js';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const { rows } = await pool.query<{
    session_id: string;
    models: string[] | null;
    input_tokens: string;
    output_tokens: string;
    cache_read: string;
    cache_write: string;
    cost_usd: string;
  }>(
    `SELECT session_id, models, input_tokens, output_tokens, cache_read, cache_write, cost_usd
       FROM session_usage`,
  );

  let changed = 0;
  let oldTotal = 0;
  let newTotal = 0;

  for (const r of rows) {
    const was = Number(r.cost_usd);
    const now = estimateCostUsd({
      models: r.models ?? [],
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheRead: Number(r.cache_read),
      cacheWrite: Number(r.cache_write),
    });
    oldTotal += was;
    newTotal += now;
    if (Math.abs(now - was) < 0.00005) continue;
    changed++;
    if (APPLY) {
      await pool.query(`UPDATE session_usage SET cost_usd = $1 WHERE session_id = $2`, [now, r.session_id]);
    }
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  console.log(`${APPLY ? 'REPRICED' : 'DRY RUN'}: ${changed}/${rows.length} rows differ`);
  console.log(`  reported: ${fmt(oldTotal)}`);
  console.log(`  corrected: ${fmt(newTotal)}  (${fmt(newTotal - oldTotal)} understated)`);
  if (!APPLY) console.log('Re-run with --apply to write.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
