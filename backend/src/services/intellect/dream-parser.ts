/**
 * dream-parser.ts — Phase 48.3 DRW-06 (Layer 2 + Layer 3 of refine doctrine)
 *
 * Parses the model's JSON response, validates against the locked schema,
 * enforces the refinement-before-append rule, and assigns deterministic
 * sort_order so refinements are persisted with sort_order < additions.
 *
 * Three exports (plus two Zod schemas):
 *   - parseDreamResponse(raw): runs JSON.parse + Zod
 *   - validateRefinementDoctrine(parsed, activeCountBefore): throws on violation
 *   - assignSortOrder(parsed): mutates parsed.proposals adding _sort_order
 *
 * Ground-truth note for validateRefinementDoctrine: the `activeCountBefore`
 * parameter MUST be the DB-queried count of active directives, supplied by
 * the worker. The parsed response contains an `active_directive_count_before`
 * field that the model self-reports — that field is logged for audit but
 * is NEVER used for validation. The model could lie (e.g. report "before: 4"
 * to bypass the doctrine when the real count is 9). Trust DB > trust model.
 */

import { z } from 'zod';

// ── Zod schema (mirrors research § Expected JSON Output Contract) ────────────

export const proposalSchema = z
  .object({
    kind: z.enum(['merge', 'supersede', 'delete', 'new_directive']),
    conceptual_area: z.string().min(1).max(60),
    target_directive_ids: z.array(z.string()),
    proposed_content: z.string().min(1).max(8000),
    priority: z.number().int().min(1).max(100).default(70),
    source_evidence: z.object({
      sample_turn_ids: z.array(z.number().int()).min(2),
      phrasing_examples: z.array(z.string()).min(1),
      reasoning: z.string().min(1).max(4000),
    }),
  })
  .refine(
    p => {
      if (p.kind === 'new_directive') return p.target_directive_ids.length === 0;
      if (p.kind === 'delete' || p.kind === 'supersede') return p.target_directive_ids.length === 1;
      if (p.kind === 'merge') return p.target_directive_ids.length >= 2;
      return false;
    },
    {
      message:
        'target_directive_ids count must match proposal_kind (0 for new_directive, 1 for delete/supersede, 2+ for merge)',
    },
  );

export const dreamResponseSchema = z.object({
  summary: z.string(),
  proposals: z.array(proposalSchema),
  flagged_seeds: z
    .array(
      z.object({
        seed_directive_id: z.string(),
        contradicting_turn_ids: z.array(z.number().int()),
        note: z.string(),
      }),
    )
    .optional()
    .default([]),
  active_directive_count_before: z.number().int().nonnegative(),
  active_directive_count_after_proposed: z.number().int().nonnegative(),
});

export type ParsedDreamResponse = z.infer<typeof dreamResponseSchema>;
export type ParsedProposal = ParsedDreamResponse['proposals'][number] & { _sort_order?: number };

// ── parseDreamResponse: JSON.parse with fence-extraction fallback ────────────

const FENCE_REGEX = /```(?:json)?\s*(\{[\s\S]*\})\s*```/;

export function parseDreamResponse(raw: string): ParsedDreamResponse {
  const trimmed = raw.trim();
  let candidate: unknown;
  try {
    candidate = JSON.parse(trimmed);
  } catch (firstErr) {
    // Fence-extraction fallback (some models wrap JSON in ```json ... ``` despite the prompt)
    const m = trimmed.match(FENCE_REGEX);
    if (!m) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`JSON parse failed: ${msg}`);
    }
    try {
      candidate = JSON.parse(m[1]);
    } catch (secondErr) {
      const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(`JSON parse failed (fence-extraction also failed): ${msg}`);
    }
  }
  // Zod validation — throws on schema mismatch with a useful path-prefixed message
  const result = dreamResponseSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(
      `Schema validation failed: ${result.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}

// ── validateRefinementDoctrine: DRW-06 Layer 2 ───────────────────────────────

export function validateRefinementDoctrine(
  parsed: ParsedDreamResponse,
  refineableCountBefore: number,
): void {
  // Ground-truth contract: `refineableCountBefore` is DB-queried by the worker
  // and counts ONLY non-sealed directives (source_type != 'moe-direct'). Sealed
  // seeds can never be merged/superseded/deleted (the directive_immutable_moe_direct
  // trigger blocks the mutation). If there are no refineable directives in the
  // silo, the model has no choice but to append — the doctrine MUST NOT block.
  //
  // parsed.active_directive_count_before is the model's self-report — IGNORED.
  // Trust DB > trust model.
  //
  // History: pre-fix this counted total directives against a SEED_BASELINE=4.
  // That created a deadlock for silos with ≥5 sealed directives + 0 refineables:
  // every dream-run got rejected because the model couldn't propose any
  // refinement that wouldn't violate the sealed-seed pre-flight. Fixed
  // 2026-05-16 (Porter Dreams 3) after the silo-sw-* sealed-seed set hit 6
  // entries and dream-runs began failing on real corpus.

  // Empty proposals is SUCCESS (legitimate quiet week — model found nothing to refine)
  if (parsed.proposals.length === 0) return;

  // Nothing refineable in silo → model can append freely (no deadlock)
  if (refineableCountBefore === 0) return;

  const hasNew = parsed.proposals.some(p => p.kind === 'new_directive');
  const hasRefinement = parsed.proposals.some(
    p => p.kind === 'merge' || p.kind === 'supersede' || p.kind === 'delete',
  );

  if (hasNew && !hasRefinement) {
    throw new Error(
      `Doctrine violation: new_directive proposed without prior refinement ` +
        `(refineable dir count: ${refineableCountBefore}, refinement proposals: 0). ` +
        `Worker rejecting run to enforce refine-before-append.`,
    );
  }
}

// ── assignSortOrder: DRW-06 Layer 3 ──────────────────────────────────────────

const KIND_BASE: Record<ParsedProposal['kind'], number> = {
  delete: 100,
  supersede: 200,
  merge: 300,
  new_directive: 900,
};

export function assignSortOrder(parsed: ParsedDreamResponse): void {
  // Group by conceptual_area (lexicographic across groups), then by kind base + ordinal within group.
  // Mutates each proposal in-place adding `_sort_order` (number).
  const grouped = new Map<string, ParsedProposal[]>();
  for (const p of parsed.proposals as ParsedProposal[]) {
    const k = p.conceptual_area;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(p);
  }
  // Sort areas lexicographically for deterministic cross-area ordering
  const sortedAreas = Array.from(grouped.keys()).sort();
  let areaOffset = 0;
  for (const area of sortedAreas) {
    const group = grouped.get(area)!;
    // Within group, assign sort_order = areaOffset + KIND_BASE[kind] + ordinal-of-kind-in-group
    const counters: Record<ParsedProposal['kind'], number> = {
      delete: 0,
      supersede: 0,
      merge: 0,
      new_directive: 0,
    };
    for (const p of group) {
      p._sort_order = areaOffset + KIND_BASE[p.kind] + counters[p.kind];
      counters[p.kind] += 1;
    }
    // Bump cross-area offset by 1000 so different areas don't collide
    areaOffset += 1000;
  }
}
