/**
 * memory-bench.ts — run the memory benchmark against live Porter memory.
 *
 *   npx tsx scripts/memory-bench.ts                    # full run
 *   npx tsx scripts/memory-bench.ts --tokens           # also measure payload cost
 *   npx tsx scripts/memory-bench.ts --variants control # controls only
 *   npx tsx scripts/memory-bench.ts --verify-needles   # check probes aren't stale
 *   npx tsx scripts/memory-bench.ts --compare <runId>  # diff against an earlier run
 *   npx tsx scripts/memory-bench.ts --json             # machine-readable report
 *
 * This replaces `measure-paraphrase-miss.ts` as the thing you run before and
 * after touching retrieval. That script printed a number and forgot it; this one
 * writes a checkpoint per run, so "did that help" is a diff rather than a memory
 * of what the terminal said last month.
 *
 * READ-ONLY. Nothing here writes to memory — see providers/porter-memory.ts.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.js';
import { runBenchmark, loadCheckpoint, buildReport, RUNS_DIR } from '../src/services/membench/runner.js';
import { PorterMemoryProvider } from '../src/services/membench/providers/porter-memory.js';
import { PorterProbeSet } from '../src/services/membench/probes/porter-probes.js';
import type { BenchReport } from '../src/services/membench/types.js';

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const list = (f: string): string[] | undefined => val(f)?.split(',').map((s) => s.trim());

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * A needle that no longer matches anything is a stale probe, and it reports as a
 * retrieval miss. Distinguishing the two by hand costs more than this check.
 */
async function verifyNeedles(): Promise<number> {
  const set = new PorterProbeSet();
  await set.load();
  const { rows } = await pool.query<{ content: string }>(
    `SELECT content FROM concepts WHERE status = 'active'`,
  );
  let stale = 0;
  console.log(`Checking ${set.needles().length} needles against ${rows.length} active concepts\n`);
  for (const { label, needle } of set.needles()) {
    const re = new RegExp(needle.source, needle.flags.replace('g', ''));
    const n = rows.filter((r) => re.test(r.content)).length;
    if (n === 0) {
      stale++;
      console.log(`  STALE  ${label} — ${needle} matches nothing`);
    } else if (n > 1) {
      // Not an error, but totalRelevant is declared as 1 in the probe set, so
      // recall would be understated. Worth surfacing.
      console.log(`  MULTI  ${label} — matches ${n} rows (probe declares totalRelevant: 1)`);
    } else {
      console.log(`  ok     ${label}`);
    }
  }
  if (stale > 0) {
    console.log(
      `\n${stale} stale needle(s). Those probes will report misses that are not retrieval failures.`,
    );
  }
  return stale;
}

function printReport(r: BenchReport): void {
  console.log(`\n═══ ${r.provider} / ${r.probeSet} — run ${r.runId} ═══`);
  console.log(`  MemScore:   ${r.memScore}`);
  console.log(
    `  hit@${r.k}:      ${r.summary.hits}/${r.summary.completed}  (${pct(r.summary.hitRate)})`,
  );
  console.log(
    `  recall@${r.k}:   ${pct(r.summary.meanRecall)}   [basis: ${r.summary.recallBasis}]`,
  );
  console.log(`  precision:  ${pct(r.summary.meanPrecision)}`);
  console.log(`  MRR:        ${r.summary.meanMrr.toFixed(3)}`);
  console.log(`  nDCG:       ${r.summary.meanNdcg.toFixed(3)}`);
  console.log(
    `  latency:    mean ${r.latency.mean}ms  p95 ${r.latency.p95}ms  max ${r.latency.max}ms`,
  );
  if (r.summary.failed > 0) console.log(`  FAILED:     ${r.summary.failed} probe(s) errored`);

  console.log('\n  by variant:');
  for (const [v, s] of Object.entries(r.byVariant)) {
    console.log(`    ${v.padEnd(12)} ${s.hits}/${s.total}  hit ${pct(s.hitRate)}  mrr ${s.meanMrr.toFixed(3)}`);
  }
  console.log('\n  by category:');
  for (const [c, s] of Object.entries(r.byCategory)) {
    console.log(`    ${c.padEnd(20)} ${s.hits}/${s.total}  hit ${pct(s.hitRate)}`);
  }

  const misses = r.results.filter((x) => x.metrics && x.metrics.hitAtK === 0);
  if (misses.length) {
    console.log(`\n  misses (${misses.length}):`);
    for (const m of misses) {
      console.log(`    [${m.variant}] ${m.label}`);
      console.log(`        query: "${m.query}"`);
      console.log(`        got:   ${m.retrievedIds.length} row(s), none relevant`);
    }
  }
}

/** Probe-by-probe diff. The reason runs are checkpointed at all. */
function compare(baseline: BenchReport, current: BenchReport): void {
  console.log(`\n═══ ${baseline.runId} → ${current.runId} ═══`);
  console.log(`  MemScore:  ${baseline.memScore}  →  ${current.memScore}`);
  const d = (current.summary.hitRate - baseline.summary.hitRate) * 100;
  console.log(
    `  hit rate:  ${pct(baseline.summary.hitRate)}  →  ${pct(current.summary.hitRate)}  (${d >= 0 ? '+' : ''}${d.toFixed(1)}pp)`,
  );
  if (baseline.summary.recallBasis !== current.summary.recallBasis) {
    console.log(
      `  ⚠ recall basis changed (${baseline.summary.recallBasis} → ${current.summary.recallBasis}) — the two recall figures are not comparable`,
    );
  }

  const prior = new Map(baseline.results.map((r) => [r.probeId, r]));
  const fixed: string[] = [];
  const broke: string[] = [];
  for (const cur of current.results) {
    const was = prior.get(cur.probeId);
    if (!was?.metrics || !cur.metrics) continue;
    if (was.metrics.hitAtK === 0 && cur.metrics.hitAtK === 1) fixed.push(cur.probeId);
    if (was.metrics.hitAtK === 1 && cur.metrics.hitAtK === 0) broke.push(cur.probeId);
  }
  if (fixed.length) console.log(`\n  FIXED (${fixed.length}):\n    ${fixed.join('\n    ')}`);
  if (broke.length) console.log(`\n  REGRESSED (${broke.length}):\n    ${broke.join('\n    ')}`);
  if (!fixed.length && !broke.length) console.log('\n  no per-probe changes');
}

function loadReport(runId: string): BenchReport {
  const saved = path.join(RUNS_DIR, `${runId}.report.json`);
  if (fs.existsSync(saved)) return JSON.parse(fs.readFileSync(saved, 'utf8')) as BenchReport;
  const cp = loadCheckpoint(runId);
  if (!cp) throw new Error(`no run ${runId} under ${RUNS_DIR}`);
  const set = new PorterProbeSet();
  // Rebuilding from the checkpoint is why retrievedIds/relevance are persisted.
  return buildReport(cp, (set.load(), set.getProbes()), cp.createdAt);
}

async function main(): Promise<void> {
  if (has('--verify-needles')) {
    const stale = await verifyNeedles();
    await pool.end();
    process.exit(stale > 0 ? 1 : 0);
  }

  const report = await runBenchmark({
    provider: new PorterMemoryProvider({
      agentId: val('--agent'),
      projectId: val('--project'),
    }),
    probeSet: new PorterProbeSet(),
    k: val('--k') ? Number(val('--k')) : 10,
    measureTokens: has('--tokens'),
    resumeRunId: val('--resume'),
    filter: {
      categories: list('--categories'),
      variants: list('--variants'),
      limit: val('--limit') ? Number(val('--limit')) : undefined,
    },
    onProgress: (done, total, last) => {
      if (has('--json')) return;
      const mark = last.status === 'failed' ? 'ERR' : last.metrics?.hitAtK ? ' ok' : 'MISS';
      process.stdout.write(`  [${String(done).padStart(2)}/${total}] ${mark}  ${last.probeId}\n`);
    },
  });

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RUNS_DIR, `${report.runId}.report.json`),
    JSON.stringify(report, null, 2),
  );

  if (has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
    const baselineId = val('--compare');
    if (baselineId) compare(loadReport(baselineId), report);
    console.log(`\n  saved: ${path.join(RUNS_DIR, `${report.runId}.report.json`)}`);
    console.log(`  diff:  npx tsx scripts/memory-bench.ts --compare ${report.runId}\n`);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('[memory-bench]', e instanceof Error ? e.message : e);
  await pool.end().catch(() => {});
  process.exit(1);
});
