/**
 * release-kit — post-commit run sequence (R1).
 *
 * Order (hard, sequential, halt-on-red):
 *   (a) run the smoke test (manifest.test.smoke) [+ regression if declared] — HALT on failure
 *   (b) version + changelog are ALREADY in the commit (pre-commit gate enforced it) — no-op note
 *   (c) git push to githubRemote/defaultBranch
 *   (d) announce via the ymc HTTP adapter (only if announce.mode === 'ymc-http'),
 *       reading the latest release note from the changelog (+ version from versionFile)
 *   (e) return a structured result (R2 will register this with Porter)
 *
 * Every step is logged. This is the RUN half of the ceremony; the gate half is
 * pure (gate.ts). smoke/regression are project npm scripts; deploy + announce
 * delivery stay project/ymc owned. Kit owns the ORDER + halt policy only.
 *
 * `dry` runs smoke but SKIPS push + sends announce as --dry (no network send) —
 * used to exercise the sequence without touching a live remote/group.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReleaseManifest } from './manifest-schema.js';
import { announceViaYmc, type AnnounceResult } from './announce-adapter.js';
import { registerRelease } from './register.js';

export interface RunOptions {
  repoRoot: string;
  manifest: ReleaseManifest;
  /** skip push + send announce as --dry (safe local exercise). */
  dry?: boolean;
  /** logger sink; defaults to console.log. */
  log?: (line: string) => void;
}

export interface RunStep {
  step: string;
  ok: boolean;
  skipped?: boolean;
  detail: string;
}

export interface RunResult {
  ok: boolean;
  halted: boolean;
  version: string;
  steps: RunStep[];
  announce?: AnnounceResult;
}

/** Extract the version string from the versionFile (semver, first match). */
export function extractVersion(repoRoot: string, manifest: ReleaseManifest): string | null {
  try {
    const txt = readFileSync(join(repoRoot, manifest.versionFile), 'utf8');
    const m = txt.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort R1 release-note reader: version from versionFile, title + bullets
 * from the TOP entry of the changelog. A project-specific typed-feed reader
 * (PORTER_RELEASES / SITE_RELEASES) can replace this later; the announce
 * adapter contract only needs {version, title, bullets}.
 */
export function readLatestReleaseNote(
  repoRoot: string,
  manifest: ReleaseManifest,
): { version: string; title: string; bullets: string[] } {
  const version = extractVersion(repoRoot, manifest) ?? '0.0.0';
  let title = `Release ${version}`;
  const bullets: string[] = [];
  try {
    const cl = readFileSync(join(repoRoot, manifest.changelogPath), 'utf8');
    const lines = cl.split('\n');
    // find first heading line (## ...), take its text as title, collect
    // subsequent bullet lines until the next heading.
    let i = lines.findIndex((l) => /^#{1,3}\s/.test(l));
    if (i >= 0) {
      title = lines[i].replace(/^#{1,3}\s*/, '').trim() || title;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,3}\s/.test(lines[j])) break;
        const b = lines[j].match(/^\s*[-*]\s+(.*)$/);
        if (b) bullets.push(b[1].trim());
      }
    }
  } catch {
    /* changelog unreadable — fall back to version-only note */
  }
  return { version, title, bullets };
}

function runScript(repoRoot: string, name: string): { ok: boolean; detail: string } {
  // Run as an npm script by name; captures exit code + tail of output.
  const res = spawnSync('npm', ['run', name], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10 * 60_000,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  const tail = out.split('\n').slice(-8).join('\n');
  if (res.error) return { ok: false, detail: `spawn error: ${res.error.message}` };
  return { ok: res.status === 0, detail: `exit=${res.status}${tail ? `\n${tail}` : ''}` };
}

function gitPush(repoRoot: string, remote: string, branch: string): { ok: boolean; detail: string } {
  const res = spawnSync('git', ['-C', repoRoot, 'push', remote, branch], {
    encoding: 'utf8',
    timeout: 2 * 60_000,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  if (res.error) return { ok: false, detail: `spawn error: ${res.error.message}` };
  return { ok: res.status === 0, detail: `exit=${res.status}${out ? `\n${out}` : ''}` };
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const { repoRoot, manifest, dry = false } = opts;
  const log = opts.log ?? ((l: string) => console.log(l));

  // R3: delegate mode — the kit is a thin shim over the repo's OWN post-commit.
  if ((manifest.run?.mode ?? 'kit') === 'delegate') {
    return runDelegate(opts);
  }

  const steps: RunStep[] = [];
  const version = extractVersion(repoRoot, manifest) ?? 'unknown';

  const push = (s: RunStep) => {
    steps.push(s);
    const tag = s.skipped ? 'SKIP' : s.ok ? 'OK' : 'FAIL';
    log(`[run] ${tag} ${s.step}${s.detail ? ` — ${s.detail.split('\n')[0]}` : ''}`);
  };

  // (a) smoke [+ regression]
  const smoke = runScript(repoRoot, manifest.test.smoke);
  push({ step: `smoke (${manifest.test.smoke})`, ok: smoke.ok, detail: smoke.detail });
  if (!smoke.ok) {
    log('[run] HALT — smoke failed; no push, no announce.');
    return { ok: false, halted: true, version, steps };
  }
  if (manifest.test.regression) {
    const reg = runScript(repoRoot, manifest.test.regression);
    push({ step: `regression (${manifest.test.regression})`, ok: reg.ok, detail: reg.detail });
    if (!reg.ok) {
      log('[run] HALT — regression failed; no push, no announce.');
      return { ok: false, halted: true, version, steps };
    }
  }

  // (b) version + changelog already committed (gate-enforced)
  push({ step: 'version+changelog', ok: true, skipped: true, detail: `v${version} already in commit` });

  // (c) push
  if (dry) {
    push({ step: 'push', ok: true, skipped: true, detail: 'dry — push skipped' });
  } else {
    const p = gitPush(repoRoot, manifest.githubRemote, manifest.defaultBranch);
    push({ step: `push (${manifest.githubRemote}/${manifest.defaultBranch})`, ok: p.ok, detail: p.detail });
    if (!p.ok) {
      log('[run] HALT — push failed; not announcing.');
      return { ok: false, halted: true, version, steps };
    }
  }

  // (d) announce
  let announce: AnnounceResult | undefined;
  if (manifest.announce.mode === 'ymc-http') {
    const note = readLatestReleaseNote(repoRoot, manifest);
    announce = await announceViaYmc({
      kind: manifest.announce.kind,
      version: note.version,
      title: note.title,
      bullets: note.bullets,
      endpoint: manifest.announce.endpoint,
      dry,
    });
    push({
      step: `announce (${manifest.announce.kind})`,
      ok: announce.ok,
      detail: announce.error ?? announce.reason ?? (announce.sent ? 'sent' : announce.skipped ? 'skipped (idempotent)' : 'ok'),
    });
  } else {
    push({ step: 'announce', ok: true, skipped: true, detail: `mode=${manifest.announce.mode} (no announce)` });
  }

  // (e) structured result — R2 registers this with Porter
  const ok = steps.every((s) => s.ok);
  log(`[run] ${ok ? 'DONE' : 'COMPLETED WITH ERRORS'} — v${version}`);
  return { ok, halted: false, version, steps, announce };
}

/**
 * R3 DELEGATE run: the repo owns the ENTIRE ceremony. The kit does NOT reorder,
 * replace, or retire anything — it execs the repo's EXISTING post-commit
 * (manifest.run.delegateCommand), whose exit code is authoritative, and then
 * SKIPS every kit-native side effect (push/deploy/announce) so nothing is done
 * twice. Announce stays with the repo (announce.mode should be 'none' here — no
 * double-announce). When register.mode==='audit-only' the kit records the
 * release with Porter as pure, non-fatal telemetry.
 */
async function runDelegate(opts: RunOptions): Promise<RunResult> {
  const { repoRoot, manifest, dry = false } = opts;
  const log = opts.log ?? ((l: string) => console.log(l));
  const steps: RunStep[] = [];
  const version = extractVersion(repoRoot, manifest) ?? 'unknown';

  const push = (s: RunStep) => {
    steps.push(s);
    const tag = s.skipped ? 'SKIP' : s.ok ? 'OK' : 'FAIL';
    log(`[run] ${tag} ${s.step}${s.detail ? ` — ${s.detail.split('\n')[0]}` : ''}`);
  };

  const cmd = manifest.run?.delegateCommand;
  if (!cmd || cmd.length === 0) {
    push({ step: 'delegate', ok: false, detail: "run.mode='delegate' but run.delegateCommand not declared" });
    return { ok: false, halted: true, version, steps };
  }

  if (dry) {
    push({
      step: 'delegate',
      ok: true,
      skipped: true,
      detail: `dry — would exec repo ceremony: ${cmd.join(' ')} (build/rsync/restart/verify/announce owned by repo)`,
    });
  } else {
    log(`[run] delegate → ${cmd.join(' ')}`);
    const res = spawnSync(cmd[0], cmd.slice(1), {
      cwd: repoRoot,
      stdio: 'inherit',
      timeout: 30 * 60_000,
    });
    const exitCode = res.status ?? (res.error ? 1 : 0);
    push({ step: `delegate (${cmd.join(' ')})`, ok: exitCode === 0, detail: `exit=${exitCode}` });
    if (exitCode !== 0) {
      log('[run] HALT — delegated ceremony failed.');
      return { ok: false, halted: true, version, steps };
    }
  }

  // Kit-native side effects are the repo's job in delegate mode — never doubled.
  push({ step: 'push', ok: true, skipped: true, detail: 'delegate — repo owns push' });
  push({ step: 'deploy', ok: true, skipped: true, detail: 'delegate — repo deploy owns deploy' });
  push({
    step: 'announce',
    ok: true,
    skipped: true,
    detail: `announce.mode=${manifest.announce.mode} — repo owns announce (no double-announce)`,
  });

  // audit-only register — pure, non-fatal telemetry.
  if ((manifest.register?.mode ?? 'full') === 'audit-only') {
    const reg = await registerRelease(repoRoot, manifest, { dry });
    push({ step: 'register (audit-only)', ok: true, skipped: !reg.sent, detail: reg.detail });
  }

  log(`[run] DONE (delegate) — v${version}`);
  return { ok: true, halted: false, version, steps };
}
