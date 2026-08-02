/**
 * measure-paraphrase-miss.ts — the measurement R6 was gated on and nobody took.
 *
 * `planning/tom-memory/RELEASE-SCHEDULE.md:21` (in the ymc repo) makes semantic
 * recall CONDITIONAL: *"Semantic recall — ONLY IF post-R2 logs still show
 * paraphrase misses… Measure residual paraphrase-miss rate after R1–R5. If
 * material: [build embeddings]"*. R6 then sat untouched for five weeks, because
 * the gate was never evaluated — the work was neither done nor ruled out.
 *
 * ⚠️ THE POINT IS TO BE ABLE TO SAY NO. Embeddings are the largest single item
 * left on that roadmap (an ollama model resident in RAM on an 8GB box, a vector
 * column, a fusion layer in the recall hot path). Building them because they are
 * interesting, rather than because recall is measurably failing, is exactly what
 * the gate exists to prevent.
 *
 * METHOD. For each probe: a CONTROL query using the concept's own words, and a
 * PARAPHRASE query saying the same thing in words that do not appear in it.
 *   · control misses  → recall is broken generally, not a paraphrase problem;
 *     fixing FTS is then far cheaper than adding a second retrieval system.
 *   · control hits, paraphrase misses → the residual R6 was asking about.
 * Paraphrases are handwritten against the real stored text and deliberately
 * share as few stems as English allows, so this measures the WORST realistic
 * case rather than a flattering one.
 */
import 'dotenv/config';
import { pool } from '../src/db/client.js';
import { embed, toVectorLiteral } from '../src/services/intellect/embeddings.js';

interface Probe { label: string; needle: RegExp; control: string; paraphrase: string }

/**
 * Probes written against concepts actually stored for agent `tom`.
 * `needle` identifies the concept the query SHOULD surface.
 */
const PROBES: Probe[] = [
  {
    label: 'Moe — terse, no fluff',
    needle: /Terse, hates fluff/i,
    control: 'Moe terse hates fluff AI slop',
    paraphrase: 'how does he like me to write to him — short or chatty',
  },
  {
    label: 'Moe — distressed/workout expertise',
    needle: /Distressed\/workout investing/i,
    control: 'Moe expertise distressed workout investing fund structuring',
    paraphrase: 'what kind of deals does he actually know inside out',
  },
  {
    label: 'Clement — compliance/KYC',
    needle: /Compliance and KYC lead/i,
    control: 'Clement compliance KYC lead precise',
    paraphrase: 'who should I ask about anti money laundering paperwork',
  },
  {
    label: 'Yai — introductions',
    needle: /warm introductions/i,
    control: 'Yai relationships warm introductions network',
    paraphrase: 'who opens doors to new people for us',
  },
  {
    label: 'Moe — Epic Games / EG Holdings',
    needle: /Epic Games exposure/i,
    control: 'Moe focus Epic Games EG Holdings First Digital corp-sec fund-admin JV',
    paraphrase: 'the gaming company stake we hold through a holdco',
  },
  {
    label: 'Filing — resignation/appointment letters',
    needle: /resignation and appointment letters/i,
    control: 'file officer secretary resignation appointment letters under the entity',
    paraphrase: 'where do I put paperwork when a company changes who runs it',
  },
  {
    label: 'Filing — board resolutions at incorporation',
    needle: /resolutions of the board/i,
    control: 'document titled resolutions of the board incorporation directors secretary capital shares',
    paraphrase: 'a paper where the founders formally agree the first decisions of a new company',
  },
  {
    label: 'TTS — pronouncing Moe',
    needle: /bm_george TTS/i,
    control: 'bm_george TTS pronunciation of Moe name phonetic',
    paraphrase: 'make sure the voice says his name properly out loud',
  },
];

/**
 * ⚠️ AND vs OR is the whole story, so measure BOTH.
 *
 * `websearch_to_tsquery` ANDs unquoted terms, and `memory-injection.ts:297` —
 * the path Tom's every turn goes through — uses exactly that. So a natural
 * question requires EVERY word to be present in the concept, and one absent stem
 * returns nothing at all. RELEASE-SCHEDULE.md:16 specified FTS "(R1, OR)"; the
 * shipped code is AND.
 *
 * If OR closes the gap, R6's embedder is not needed for this — and a one-line
 * query change on an 8GB box is a very different proposition from a resident
 * model plus a vector column plus a fusion layer in the hot path.
 */
const OR_SQL = `
  SELECT content, ts_rank(search_vector, q) AS rank
    FROM concepts, websearch_to_tsquery('english', $1) AS raw,
         to_tsquery('english', array_to_string(
           ARRAY(SELECT unnest(string_to_array(replace(raw::text, '''', ''), ' & '))), ' | ')) AS q
   WHERE status = 'active' AND scope = 'agent' AND scope_id = 'tom'
     AND search_vector @@ q
   ORDER BY rank DESC
   LIMIT 8`;

const RECALL_SQL = `
  SELECT content, ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
    FROM concepts
   WHERE status = 'active' AND scope = 'agent' AND scope_id = 'tom'
     AND search_vector @@ websearch_to_tsquery('english', $1)
   ORDER BY rank DESC
   LIMIT 8`;

async function hits(query: string, needle: RegExp, sql = RECALL_SQL): Promise<{ found: boolean; top: string | null; n: number }> {
  const { rows } = await pool.query<{ content: string }>(sql, [query]).catch(() => ({ rows: [] as { content: string }[] }));
  return {
    found: rows.some((r) => needle.test(r.content)),
    top: rows[0]?.content?.slice(0, 60) ?? null,
    n: rows.length,
  };
}


/**
 * HYBRID — the retrieval `memory-injection.ts` actually performs since R6:
 * FTS(OR) ⊕ ANN, fused by reciprocal rank with k=60. Reimplemented here rather
 * than imported because the injection builder returns a rendered prompt string,
 * not rows, and this needs to ask "is the right concept in the candidate set".
 * ⚠️ If the fusion in memory-injection.ts changes, change it here too or this
 * measures a retrieval nobody runs.
 */
async function hybridHits(query: string, needle: RegExp): Promise<{ found: boolean; top: string | null; n: number }> {
  const fts = await pool.query<{ content: string }>(OR_SQL, [query])
    .catch(() => ({ rows: [] as { content: string }[] }));
  const qVec = await embed(query);
  let ann: { rows: { content: string }[] } = { rows: [] };
  if (qVec) {
    ann = await pool.query<{ content: string }>(
      `SELECT content FROM concepts
        WHERE status='active' AND scope='agent' AND scope_id='tom' AND embedding IS NOT NULL
        ORDER BY (embedding <=> $1::vector) LIMIT 8`,
      [toVectorLiteral(qVec)],
    ).catch(() => ({ rows: [] as { content: string }[] }));
  }
  const K = 60;
  const score = new Map<string, number>();
  fts.rows.forEach((r, i) => score.set(r.content, (score.get(r.content) ?? 0) + 1 / (K + i + 1)));
  ann.rows.forEach((r, i) => score.set(r.content, (score.get(r.content) ?? 0) + 1 / (K + i + 1)));
  const fused = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
  return { found: fused.some((c) => needle.test(c)), top: fused[0]?.slice(0, 60) ?? null, n: fused.length };
}

async function main(): Promise<void> {
  const total = (await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM concepts WHERE status='active' AND scope='agent' AND scope_id='tom'`)).rows[0].n;
  console.log(`R6 GATE MEASUREMENT — paraphrase-miss rate over ${total} active concepts for agent:tom\n`);

  let controlMiss = 0, paraMiss = 0, orControlMiss = 0, orParaMiss = 0;
  let hybControlMiss = 0, hybParaMiss = 0, hybParaMissAbs = 0;
  for (const p of PROBES) {
    const c = await hits(p.control, p.needle);
    const q = await hits(p.paraphrase, p.needle);
    const oc = await hits(p.control, p.needle, OR_SQL);
    const oq = await hits(p.paraphrase, p.needle, OR_SQL);
    const hc = await hybridHits(p.control, p.needle);
    const hq = await hybridHits(p.paraphrase, p.needle);
    if (!hc.found) hybControlMiss++;
    if (hc.found && !hq.found) hybParaMiss++;
    if (!hq.found) hybParaMissAbs++;
    if (!oc.found) orControlMiss++;
    if (oc.found && !oq.found) orParaMiss++;
    if (!c.found) controlMiss++;
    if (c.found && !q.found) paraMiss++;
    const verdict = !c.found ? 'CONTROL MISS (FTS broken for this concept)'
      : q.found ? 'both hit' : 'PARAPHRASE MISS';
    console.log(`${verdict.padEnd(42)} ${p.label}`);
    if (c.found && !q.found) console.log(`    paraphrase "${p.paraphrase}" returned ${q.n} row(s); top: ${q.top ?? '(none)'}`);
  }

  const orTestable = PROBES.length - orControlMiss;
  console.log(`\n--- same probes with OR semantics ---`);
  console.log(`control misses: ${orControlMiss}/${PROBES.length}`);
  console.log(`paraphrase misses: ${orParaMiss}/${orTestable} testable = ${orTestable ? ((orParaMiss/orTestable)*100).toFixed(0) : 0}%`);

  const hybTestable = PROBES.length - hybControlMiss;
  console.log(`\n--- HYBRID (FTS-OR + embeddings, RRF k=60) — what injection actually runs ---`);
  console.log(`control misses: ${hybControlMiss}/${PROBES.length}`);
  console.log(`paraphrase misses: ${hybParaMiss}/${hybTestable} testable = ${hybTestable ? ((hybParaMiss/hybTestable)*100).toFixed(0) : 0}%`);
  console.log(`paraphrase misses, ALL probes (not just testable): ${hybParaMissAbs}/${PROBES.length}`);

  const testable = PROBES.length - controlMiss;
  const rate = testable ? (paraMiss / testable) * 100 : 0;
  console.log(`\ncontrol misses: ${controlMiss}/${PROBES.length}`);
  console.log(`paraphrase misses: ${paraMiss}/${testable} testable = ${rate.toFixed(0)}%`);
  console.log(
    rate >= 50 ? '\nGATE: OPEN — the residual is material. R6 (embeddings) is justified.'
    : rate > 0 ? '\nGATE: MARGINAL — some residual. Weigh against the cost of a resident embedder on an 8GB box.'
    : '\nGATE: CLOSED — FTS is finding these. Do NOT build R6 on this evidence.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
