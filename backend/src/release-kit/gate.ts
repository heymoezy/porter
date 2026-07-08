/**
 * release-kit — pre-commit gate (R1).
 *
 * PURE contract check. No git calls, no filesystem writes, no side effects: the
 * caller (cli.ts pre-commit shim) gathers the staged file list and passes it in.
 *
 * Mirrors ymc's proven deploy/git-hooks/pre-commit rule (the R9 inversion:
 * "every code ship bumps, no exemptions"):
 *   - if the staged diff TOUCHES CODE, the versionFile MUST be staged; and
 *   - a version bump can never be partial — whenever the versionFile is staged,
 *     the changelogPath MUST be staged too, and the releaseFeed if declared.
 *
 * The kit is generic, so "code touch" is any staged path that is NOT a
 * release-metadata file (version/changelog/feed) and NOT an obvious
 * doc/coordination file. ymc hardcodes an allowlist of code prefixes; a shared
 * kit can't, so it uses an exclude set instead — same intent: docs-only /
 * metadata-only commits don't force a version bump; touching real code does.
 *
 * REFUSE = { ok: false } with clear messages. The shim maps !ok → exit 1.
 * This gate does NOT bump, write, test, push, or announce.
 */
import type { ReleaseManifest } from './manifest-schema.js';

export interface GateInput {
  repoRoot: string;
  /** output of `git diff --cached --name-only`, repo-relative paths. */
  stagedFiles: string[];
  manifest: ReleaseManifest;
}

export interface GateResult {
  ok: boolean;
  /** human-readable refusal reasons (empty when ok). */
  refusals: string[];
  /** informational notes (e.g. "docs-only commit, no version required"). */
  notes: string[];
}

/** Paths that never count as a "code touch" on their own. */
const DOC_META_PATTERNS: RegExp[] = [
  /^CHECKPOINT\.md$/,
  /^README(\.md)?$/i,
  /(^|\/)CLAUDE\.md$/,
  /^\.coordination\//,
  /^planning\//,
  /^docs?\//,
  /\.md$/, // markdown docs in general (changelog is matched separately as metadata)
];

function isDocOrMeta(file: string): boolean {
  return DOC_META_PATTERNS.some((re) => re.test(file));
}

/**
 * A staged file is a "code touch" if it is neither a release-metadata file
 * (version/changelog/feed) nor a doc/coordination file.
 */
export function isCodeTouch(file: string, manifest: ReleaseManifest): boolean {
  if (file === manifest.versionFile) return false;
  if (file === manifest.changelogPath) return false;
  if (manifest.releaseFeed && file === manifest.releaseFeed) return false;
  if (isDocOrMeta(file)) return false;
  return true;
}

export function runGate(input: GateInput): GateResult {
  const { stagedFiles, manifest } = input;
  const refusals: string[] = [];
  const notes: string[] = [];

  const versionStaged = stagedFiles.includes(manifest.versionFile);
  const changelogStaged = stagedFiles.includes(manifest.changelogPath);
  const feedStaged = manifest.releaseFeed ? stagedFiles.includes(manifest.releaseFeed) : true;
  const codeTouched = stagedFiles.some((f) => isCodeTouch(f, manifest));

  if (stagedFiles.length === 0) {
    notes.push('no staged files — nothing to gate');
    return { ok: true, refusals, notes };
  }

  // Rule 1: code touched ⇒ version must be bumped (staged).
  if (codeTouched && !versionStaged) {
    refusals.push(
      `code changes staged but ${manifest.versionFile} not bumped in this diff. ` +
        `EVERY code ship bumps the version + changelog${manifest.releaseFeed ? ' + release feed' : ''} (no internal-change exemption).`,
    );
  }

  // Rule 2: a bump can never be partial.
  if (versionStaged) {
    if (!changelogStaged) {
      refusals.push(
        `${manifest.versionFile} staged but ${manifest.changelogPath} not — a version bump must include its changelog entry.`,
      );
    }
    if (manifest.releaseFeed && !feedStaged) {
      refusals.push(
        `${manifest.versionFile} staged but release feed ${manifest.releaseFeed} not — declared feed must carry the new version.`,
      );
    }
  }

  if (refusals.length === 0) {
    if (!codeTouched && !versionStaged) notes.push('docs/metadata-only commit — no version bump required');
    else if (versionStaged) notes.push('release commit — version + changelog' + (manifest.releaseFeed ? ' + feed' : '') + ' present');
  }

  return { ok: refusals.length === 0, refusals, notes };
}
