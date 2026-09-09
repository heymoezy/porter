/**
 * probes/porter-probes.ts — Porter's benchmark question set.
 *
 * The eight probes in `scripts/measure-paraphrase-miss.ts` were the only memory
 * measurement Porter had, and they lived in a one-shot script whose output went
 * to a terminal and then nowhere. They are reproduced here VERBATIM (same
 * queries, same needles) so the harness continues the existing series rather
 * than starting a new one — the 4/8 paraphrase-miss figure quoted in
 * `embeddings.ts:16` stays comparable.
 *
 * Each probe becomes TWO questions:
 *   control    — the concept's own words. A miss here means retrieval is broken
 *                generally, not that paraphrasing is hard.
 *   paraphrase — the same question in deliberately disjoint vocabulary. This is
 *                the residual embeddings were built for.
 * Reported separately (`byVariant`), because averaging them hides which one moved.
 *
 * ⚠️ WHAT THIS SET DOES AND DOES NOT COVER.
 * Every probe here is an ENTITY-FACT question — who knows what, where a document
 * goes. That is not a bias in the probe set; it is what Tom's corpus is made of.
 * It also means this set says nothing about the directive path, whose failure
 * mode is precedence rather than recall (a rule that is found but outranked is a
 * miss no retrieval metric here would catch). The `directive` category below is
 * a placeholder with no probes for exactly that reason — see the note on it.
 *
 * ⚠️ NEEDLES ARE WRITTEN AGAINST LIVE ROWS. If the distiller rewords a concept,
 * its needle stops matching and the probe reports a miss that is really a stale
 * needle. `npx tsx scripts/memory-bench.ts --verify-needles` checks every needle
 * still matches something in the corpus before a run is trusted.
 */
import type { Probe, ProbeSet } from '../types.js';

interface Seed {
  label: string;
  category: string;
  needle: RegExp;
  control: string;
  paraphrase: string;
  /** Concepts in the corpus that should match. Defaults to 1. */
  totalRelevant?: number;
  expectedAnswer?: string;
}

/**
 * Ported unchanged from scripts/measure-paraphrase-miss.ts.
 *
 * `totalRelevant: 1` throughout: each needle identifies exactly one stored
 * concept, so recall has a real denominator and does not fall back to the hit
 * proxy. If a needle ever legitimately matches several rows, raise it here —
 * leaving it at 1 would let a system score recall 1.0 while missing the others.
 */
const SEEDS: Seed[] = [
  {
    label: 'Moe — terse, no fluff',
    category: 'person-preference',
    needle: /Terse, hates fluff/i,
    control: 'Moe terse hates fluff AI slop',
    paraphrase: 'how does he like me to write to him — short or chatty',
    expectedAnswer: 'Moe prefers terse writing and dislikes filler.',
  },
  {
    label: 'Moe — distressed/workout expertise',
    category: 'person-expertise',
    needle: /Distressed\/workout investing/i,
    control: 'Moe expertise distressed workout investing fund structuring',
    paraphrase: 'what kind of deals does he actually know inside out',
    expectedAnswer: 'Distressed/workout investing and fund structuring.',
  },
  {
    label: 'Clement — compliance/KYC',
    category: 'person-expertise',
    needle: /Compliance and KYC lead/i,
    control: 'Clement compliance KYC lead precise',
    // The probe named in embeddings.ts:16 as the reason semantic recall was
    // built. It is the canonical regression case for this whole harness.
    paraphrase: 'who should I ask about anti money laundering paperwork',
    expectedAnswer: 'Clement, the compliance and KYC lead.',
  },
  {
    label: 'Yai — introductions',
    category: 'person-expertise',
    needle: /warm introductions/i,
    control: 'Yai relationships warm introductions network',
    paraphrase: 'who opens doors to new people for us',
    expectedAnswer: 'Yai, who handles relationships and warm introductions.',
  },
  {
    label: 'Moe — Epic Games / EG Holdings',
    category: 'holding',
    needle: /Epic Games exposure/i,
    control: 'Moe focus Epic Games EG Holdings First Digital corp-sec fund-admin JV',
    paraphrase: 'the gaming company stake we hold through a holdco',
    expectedAnswer: 'Epic Games exposure held via EG Holdings.',
  },
  {
    label: 'Filing — resignation/appointment letters',
    category: 'filing-rule',
    needle: /resignation and appointment letters/i,
    control: 'file officer secretary resignation appointment letters under the entity',
    paraphrase: 'where do I put paperwork when a company changes who runs it',
    expectedAnswer: 'Under the entity, as resignation and appointment letters.',
  },
  {
    label: 'Filing — board resolutions at incorporation',
    category: 'filing-rule',
    needle: /resolutions of the board/i,
    control:
      'document titled resolutions of the board incorporation directors secretary capital shares',
    paraphrase: 'a paper where the founders formally agree the first decisions of a new company',
    expectedAnswer: 'Resolutions of the board, filed at incorporation.',
  },
  {
    label: 'TTS — pronouncing Moe',
    category: 'ops-rule',
    needle: /bm_george TTS/i,
    control: 'bm_george TTS pronunciation of Moe name phonetic',
    paraphrase: 'make sure the voice says his name properly out loud',
    expectedAnswer: 'Use the bm_george TTS voice with the phonetic spelling.',
  },
];

function expand(seeds: Seed[]): Probe[] {
  const out: Probe[] = [];
  for (const s of seeds) {
    const slug = s.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    for (const variant of ['control', 'paraphrase'] as const) {
      out.push({
        id: `${slug}:${variant}`,
        label: s.label,
        variant,
        category: s.category,
        query: variant === 'control' ? s.control : s.paraphrase,
        groundTruth: { needle: s.needle, totalRelevant: s.totalRelevant ?? 1 },
        expectedAnswer: s.expectedAnswer,
      });
    }
  }
  return out;
}

/**
 * The Porter probe set.
 *
 * `load()` is a no-op — the questions are compiled in. It exists because the
 * ProbeSet contract has to accommodate a set that reads a dataset off disk
 * (LongMemEval-style), and a future contact-recall set will do exactly that.
 */
export class PorterProbeSet implements ProbeSet {
  readonly name = 'porter-probes';
  private probes: Probe[] = [];

  async load(): Promise<void> {
    this.probes = expand(SEEDS);
  }

  getProbes(filter?: {
    categories?: string[];
    variants?: string[];
    limit?: number;
  }): Probe[] {
    let out = this.probes;
    if (filter?.categories?.length) {
      const want = new Set(filter.categories);
      out = out.filter((p) => want.has(p.category));
    }
    if (filter?.variants?.length) {
      const want = new Set(filter.variants);
      out = out.filter((p) => want.has(p.variant));
    }
    if (filter?.limit != null) out = out.slice(0, filter.limit);
    return out;
  }

  /** Every needle in the set, for the staleness check. */
  needles(): Array<{ label: string; needle: RegExp }> {
    return SEEDS.map((s) => ({ label: s.label, needle: s.needle }));
  }
}
