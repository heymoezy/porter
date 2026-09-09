/**
 * supersession-scan.ts — find directives that contradict each other in MEANING.
 *
 *   npx tsx scripts/supersession-scan.ts              # dry run (default)
 *   npx tsx scripts/supersession-scan.ts --write      # write pending proposals
 *
 * DRY RUN IS THE DEFAULT and `--write` is required to persist anything. Even
 * with `--write` this only ever creates `memory_proposals` rows with
 * status='pending' — nothing is retired until a proposal is reviewed and
 * `applySupersession()` is called. See services/intellect/supersession.ts for
 * why a contradiction is treated as a judgement call and a duplicate is not.
 *
 * COSTS MODEL CALLS: one adjudication per candidate pair, capped at 40 per scan.
 * That is why this is not wired into the scheduler — see CHECKPOINT.md for the
 * one-liner if you decide it should run nightly.
 */
import 'dotenv/config';
import { pool } from '../src/db/client.js';
import { runSupersessionScan } from '../src/services/intellect/supersession.js';

const write = process.argv.includes('--write');

async function main(): Promise<void> {
  console.log(write ? 'Scanning (WILL WRITE proposals)…\n' : 'Scanning (dry run — nothing written)…\n');

  const r = await runSupersessionScan({ dryRun: !write });

  console.log(`  active directives scanned : ${r.scanned}`);
  console.log(`  candidate pairs           : ${r.candidates}`);
  console.log(`  ${write ? 'proposals written' : 'would propose'}         : ${r.proposed}`);

  if (r.skipped.length) {
    // The skip reasons are the interesting output on a healthy corpus: they show
    // the gate refusing things, which is what it is for.
    console.log(`\n  skipped (${r.skipped.length}):`);
    const byReason = new Map<string, number>();
    for (const s of r.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(3)} × ${reason}`);
    }
  }

  if (!write && r.proposed > 0) {
    console.log(`\n  re-run with --write to record ${r.proposed} proposal(s) for review.`);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('[supersession-scan]', e instanceof Error ? e.message : e);
  await pool.end().catch(() => {});
  process.exit(1);
});
