/**
 * Vault drafts — dream-accepted proposals → vault draft nodes (memory-unification U4).
 *
 * When Moe ACCEPTS a dream proposal (POST /api/admin/dreams/proposals/:id/accept),
 * the Porter-side mutation (directive insert/supersede/merge/archive) stays the
 * source of runtime truth — this module additionally materializes the accepted
 * knowledge as a DRAFT markdown node in /home/lobster/vault/drafts/ and commits
 * it to the vault repo (explicit git identity + best-effort push, same pattern
 * as vault-mirror.ts).
 *
 * Drafts are for HUMAN promotion: Moe reviews a draft and moves/rewrites it into
 * concepts/ (or deletes it). They are deliberately NOT indexed — vault-indexer.ts
 * scans only concepts/ + entities/ — so an unreviewed draft never enters the
 * injection path. Pending/rejected proposals never touch the vault.
 *
 * Called post-COMMIT and fire-and-forget from the accept handler (like the SSE
 * broadcast): vault git problems must never fail or delay an accept.
 *
 * Revert (U4 is reversible): delete this file, its accept-handler hook, and any
 * drafts/*.md files.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logIntellectEvent } from './file-watcher.js';

const execFileP = promisify(execFile);

const VAULT_ROOT = '/home/lobster/vault';
const DRAFTS_DIR = 'drafts';
const SLUG_WORDS = 6;

export interface ProposalDraftInput {
  proposalId: string;   // memory_proposals.id (mp_<uuid>)
  siloId: string;
  proposalKind: string; // new_directive | supersede | merge | delete
  content: string;      // proposed_content as accepted
  reviewer: string;
}

export interface ProposalDraftResult {
  path?: string;       // vault-relative path of the draft node
  committed?: boolean; // git commit landed (push is best-effort)
  /** True when the proposal was directive-shaped and no vault node was written. */
  skipped?: boolean;
  reason?: string;
}

function fmtSgtDate(d: Date): string {
  // en-CA gives ISO-style YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function slugify(content: string): string {
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SLUG_WORDS);
  return words.join('-') || 'proposal';
}

function renderDraft(input: ProposalDraftInput, date: string): string {
  return [
    '---',
    'status: DRAFT',
    `source_proposal: ${input.proposalId}`,
    `silo: ${input.siloId}`,
    `proposal_kind: ${input.proposalKind}`,
    `accepted_by: ${input.reviewer}`,
    `accepted_date: ${date}`,
    '---',
    '',
    `# DRAFT — dream proposal (${input.siloId})`,
    '> Accepted dream proposal awaiting human promotion — rewrite into `concepts/`',
    '> (or delete). Drafts are NOT indexed into Porter; only `concepts/` +',
    '> `entities/` enter the injection path. Design: [[memory-unification-design]] (U4).',
    '',
    input.content.trim(),
    '',
  ].join('\n');
}

/**
 * Proposal kinds that OPERATE ON DIRECTIVES. These must NOT become vault drafts.
 *
 * ⚠️ The U4 design ([[memory-unification-design]], the table at its top) splits
 * the two stores on purpose: **concepts live in the vault, directives live in
 * Porter** — "Directive-shaped proposals keep the Porter directives path".
 * Accepting one of these already writes the directive inside the accept
 * transaction, which IS the injection path; a vault draft alongside it is a
 * second, inert copy of a rule that is already live.
 *
 * It was worse than redundant. Every draft in `vault/drafts/` was one of these,
 * so the folder read as a pile of accepted-but-unapplied work — and an audit on
 * 2026-08-02 concluded from it that "accepted proposals never reached concepts/
 * and have had zero effect since". They had full effect. The evidence was
 * checked before this change: all five drafts had a live matching directive.
 *
 * Deliberately a DENYlist, not an allowlist of concept kinds: the dream silos
 * emit only these four kinds today, so a genuinely concept-shaped kind added
 * later flows to the vault automatically instead of being silently dropped by a
 * list nobody remembered to extend.
 */
const DIRECTIVE_KINDS = new Set(['new_directive', 'merge', 'supersede', 'delete']);

/**
 * Write the draft node + commit it to the vault repo. File write failures throw
 * (caller logs); git commit/push are best-effort like vault-mirror.ts — the
 * draft on disk is still current even when the repo is unhappy.
 *
 * Returns `{ skipped: true }` without touching the vault for a directive-shaped
 * proposal — see DIRECTIVE_KINDS.
 */
export async function writeProposalDraft(input: ProposalDraftInput): Promise<ProposalDraftResult> {
  if (DIRECTIVE_KINDS.has(input.proposalKind)) {
    return { skipped: true, reason: `${input.proposalKind} is directive-shaped — it lives in Porter directives, not the vault` };
  }
  const date = fmtSgtDate(new Date());
  // Deterministic per proposal: re-accept impossible (status flip), but a
  // retried write just overwrites the same file — idempotent.
  const shortId = input.proposalId.replace(/^mp_/, '').slice(0, 8);
  const relPath = path.join(DRAFTS_DIR, `${date}-${slugify(input.content)}-${shortId}.md`);
  const absPath = path.join(VAULT_ROOT, relPath);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, renderDraft(input, date), 'utf8');

  let committed = false;
  try {
    await execFileP('git', ['-C', VAULT_ROOT, 'add', relPath], { timeout: 8000 });
    // Explicit identity like vault-mirror.ts — the service env has no git user.
    await execFileP(
      'git',
      ['-C', VAULT_ROOT, '-c', 'user.name=Moe Ibrahim', '-c', 'user.email=moe@themozaic.com', 'commit', '-m', `vault: draft from dream proposal ${input.proposalId}`],
      { timeout: 8000 },
    );
    committed = true;
    void execFileP('git', ['-C', VAULT_ROOT, 'push', 'origin', 'master'], { timeout: 15000 }).catch(() => {});
  } catch {
    /* nothing staged / repo issue — file on disk is still current, non-fatal */
  }

  await logIntellectEvent('vault_draft_written', 'vault_draft', {
    proposal_id: input.proposalId,
    silo_id: input.siloId,
    proposal_kind: input.proposalKind,
    committed,
    path: relPath,
  });
  return { path: relPath, committed };
}
