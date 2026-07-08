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
import { spawnSync } from 'node:child_process';
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

  // Rule 3: conditional version files (generalized tom-version rule). If any
  // staged path matches a declared prefix, the paired versionFile MUST be staged.
  for (const cvf of manifest.conditionalVersionFiles ?? []) {
    const prefixes = Array.isArray(cvf.pathPrefix) ? cvf.pathPrefix : [cvf.pathPrefix];
    const matched = stagedFiles.filter((f) => prefixes.some((p) => f.startsWith(p)));
    if (matched.length > 0 && !stagedFiles.includes(cvf.versionFile)) {
      refusals.push(
        cvf.message ??
          `${matched.length} staged file(s) match [${prefixes.join(', ')}] but required version file ` +
            `'${cvf.versionFile}' is not staged${cvf.id ? ` (rule ${cvf.id})` : ''}.`,
      );
    }
  }

  if (refusals.length === 0) {
    if (!codeTouched && !versionStaged) notes.push('docs/metadata-only commit — no version bump required');
    else if (versionStaged) notes.push('release commit — version + changelog' + (manifest.releaseFeed ? ' + feed' : '') + ' present');
  }

  return { ok: refusals.length === 0, refusals, notes };
}

// ─── R3: mode-aware gate execution (kit | delegate-with-shadow) ──────────────

export interface GateExecInput {
  repoRoot: string;
  /** output of `git diff --cached --name-only`, repo-relative paths. */
  stagedFiles: string[];
  manifest: ReleaseManifest;
  /** logger sink; defaults to console.log. */
  log?: (line: string) => void;
}

export interface GateExecResult {
  /** AUTHORITATIVE verdict. In kit mode this is the kit gate; in
   *  delegate-with-shadow it is the delegate's exit code. */
  ok: boolean;
  mode: 'kit' | 'delegate-with-shadow';
  /** the kit contract result (authoritative in kit mode; SHADOW otherwise). */
  kit: GateResult;
  /** present only in delegate-with-shadow mode. */
  delegate?: { exitCode: number; ok: boolean };
  /** shadow vs authority agreement (delegate mode only). */
  agreement?: 'agree' | 'diverge';
}

/**
 * Run the gate honoring manifest.gate.mode.
 *
 * kit (default): the pure contract check (runGate) is authoritative.
 *
 * delegate-with-shadow: spawn manifest.gate.delegateCommand (the repo's EXISTING
 * pre-commit) as the AUTHORITY — its exit code decides. The kit's own gate still
 * runs as a non-authoritative SHADOW: agreement/divergence is logged so drift is
 * visible before anyone flips authority to the kit, but the shadow NEVER blocks.
 * The delegate inherits stdio so the repo's own gate messages surface verbatim.
 */
export function executeGate(input: GateExecInput): GateExecResult {
  const { repoRoot, stagedFiles, manifest } = input;
  const log = input.log ?? ((l: string) => console.log(l));
  const mode = manifest.gate?.mode ?? 'kit';

  // Always compute the kit contract result (authoritative or shadow).
  const kit = runGate({ repoRoot, stagedFiles, manifest });

  if (mode !== 'delegate-with-shadow') {
    return { ok: kit.ok, mode: 'kit', kit };
  }

  const cmd = manifest.gate?.delegateCommand;
  if (!cmd || cmd.length === 0) {
    // Schema superRefine should prevent this; fail closed if it ever slips through.
    log('[gate] ✗ gate.mode=delegate-with-shadow but no gate.delegateCommand — refusing (fail closed).');
    return { ok: false, mode, kit };
  }

  log(`[gate] delegate-with-shadow → authority: ${cmd.join(' ')}`);
  const res = spawnSync(cmd[0], cmd.slice(1), {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: 10 * 60_000,
  });
  const exitCode = res.status ?? (res.error ? 1 : 0);
  const delegateOk = exitCode === 0;
  const agreement: 'agree' | 'diverge' = delegateOk === kit.ok ? 'agree' : 'diverge';

  // SHADOW telemetry — non-authoritative, never blocks.
  log(
    `[gate:shadow] kit(non-authoritative)=${kit.ok ? 'PASS' : 'FAIL'} vs ` +
      `delegate(AUTHORITY)=${delegateOk ? 'PASS' : `FAIL(${exitCode})`} → ${agreement.toUpperCase()}`,
  );
  for (const r of kit.refusals) log(`[gate:shadow]   kit-would-refuse: ${r}`);
  if (agreement === 'diverge') {
    log('[gate:shadow] ⚠ DIVERGENCE — kit contract disagrees with the repo gate. Investigate before flipping authority. (non-fatal)');
  }

  return { ok: delegateOk, mode, kit, delegate: { exitCode, ok: delegateOk }, agreement };
}
