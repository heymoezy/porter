/**
 * release-kit — drift audit (R2).
 *
 * This is the concrete meaning of "one of the features of Porter is to ensure
 * release consistency across all projects": for every registered project, Porter
 * computes a READ-ONLY drift report against the ratified contract WITHOUT
 * mutating anything. R2 does not wire any repo (that is R3+) — it only observes
 * and reports how far each repo is from being release-kit compliant.
 *
 * A project is `wired` (fully compliant) when ALL of:
 *   - manifestValid       release.manifest.json exists AND validates (R1 schema)
 *   - hooksWired          core.hooksPath == deploy/git-hooks, both pre-commit +
 *                         post-commit exist, and each is a THIN SHIM that calls
 *                         the kit (grep for 'porter-release' / 'release-kit' —
 *                         copied bespoke logic is exactly the fork that broke
 *                         production, so a hook that doesn't reference the kit
 *                         counts as unwired/bypassing)
 *   - kitVersionOk        manifest.kitVersion == current KIT_VERSION (stale pin
 *                         is drift)
 *   - versionFilePresent  the manifest's declared versionFile exists on disk
 *
 * Every check that fails contributes a human-readable `driftReasons` entry.
 * `lastRelease` is best-effort: if the manifest declares a releaseFeed and it is
 * readable, the top version string is surfaced (never fatal on failure).
 *
 * READ-ONLY: all git introspection is `git config --get ...` / `rev-parse`
 * (never a write); filesystem access is readFileSync/existsSync only. Nothing in
 * this module mutates a repo, a hook, or a manifest.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KIT_VERSION,
  MANIFEST_FILENAME,
  loadManifest,
  ManifestError,
  type ReleaseManifest,
} from './manifest-schema.js';
import { PROJECT_REGISTRY, type RegistryProject } from './project-registry.js';

/** The one hooksPath the ratified design mandates (thin shims live here). */
export const EXPECTED_HOOKS_PATH = 'deploy/git-hooks';
/** Hooks the contract requires (pre-commit gate + post-commit run). */
export const REQUIRED_HOOKS = ['pre-commit', 'post-commit'] as const;
/** A shim is considered kit-wired if it references either of these tokens. */
const KIT_SHIM_TOKENS = ['porter-release', 'release-kit'];

export interface HookDetail {
  name: string;
  /** file exists at deploy/git-hooks/<name>. */
  present: boolean;
  /** file content references the kit (porter-release / release-kit). */
  callsKit: boolean;
}

export interface ProjectAudit {
  /** registry project id. */
  project: string;
  /** absolute repo root that was audited. */
  repoRoot: string;
  /** repo has a resolvable git dir. */
  gitRepo: boolean;
  /** fully compliant with the release-kit contract (all checks green). */
  wired: boolean;
  /** release.manifest.json exists AND validates against the R1 schema. */
  manifestValid: boolean;
  /** hooksPath + both required hooks exist + both call the kit. */
  hooksWired: boolean;
  /** manifest.kitVersion == current KIT_VERSION. */
  kitVersionOk: boolean;
  /** manifest.versionFile exists on disk. */
  versionFilePresent: boolean;
  /** every failing check, as a human-readable reason. */
  driftReasons: string[];
  /** best-effort last-released version, read from the declared releaseFeed. */
  lastRelease?: string;
  /** observed core.hooksPath ('' when unset). */
  hooksPath: string;
  /** per-hook presence + kit-shim status. */
  hooks: HookDetail[];
  /** kitVersion pinned in the manifest (undefined when no valid manifest). */
  kitVersion?: string;
}

/** Read a git config value read-only; returns '' when unset or not a repo. */
function gitConfig(repoRoot: string, key: string): string {
  const res = spawnSync('git', ['-C', repoRoot, 'config', '--get', key], { encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : '';
}

/** Whether repoRoot resolves as a git repo (read-only rev-parse). */
function isGitRepo(repoRoot: string): boolean {
  const res = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--git-dir'], { encoding: 'utf8' });
  return res.status === 0;
}

/** Read + shim-classify the required hooks under deploy/git-hooks. */
function inspectHooks(repoRoot: string): HookDetail[] {
  return REQUIRED_HOOKS.map((name) => {
    const path = join(repoRoot, EXPECTED_HOOKS_PATH, name);
    if (!existsSync(path)) return { name, present: false, callsKit: false };
    let body = '';
    try {
      body = readFileSync(path, 'utf8');
    } catch {
      return { name, present: true, callsKit: false };
    }
    const callsKit = KIT_SHIM_TOKENS.some((t) => body.includes(t));
    return { name, present: true, callsKit };
  });
}

/**
 * Best-effort: read the FIRST semver-looking version out of the declared
 * releaseFeed file. Never throws — a missing/unreadable feed just yields
 * undefined. This is informational only, not a drift signal.
 */
function readLastRelease(repoRoot: string, manifest: ReleaseManifest): string | undefined {
  if (!manifest.releaseFeed) return undefined;
  try {
    const txt = readFileSync(join(repoRoot, manifest.releaseFeed), 'utf8');
    const m = txt.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    return m ? m[0] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Audit a single repo against the release-kit contract.
 *
 * @param repoRoot        absolute repo root to inspect (read-only).
 * @param manifest        the already-loaded, VALIDATED manifest, or null when it
 *                        is missing/invalid (see manifestError for the why).
 * @param manifestError   optional message explaining why manifest is null
 *                        (missing file vs schema failure) — surfaced verbatim in
 *                        driftReasons so the report is actionable.
 */
export function auditProject(
  repoRoot: string,
  manifest: ReleaseManifest | null,
  manifestError?: string,
): Omit<ProjectAudit, 'project'> {
  const driftReasons: string[] = [];
  const gitRepo = isGitRepo(repoRoot);
  if (!gitRepo) driftReasons.push(`${repoRoot} is not a git repository`);

  // --- manifest ---
  const manifestValid = manifest !== null;
  if (!manifestValid) {
    driftReasons.push(
      manifestError ?? `${MANIFEST_FILENAME} missing or invalid — repo not release-kit wired`,
    );
  }

  // --- hooks ---
  const hooksPath = gitConfig(repoRoot, 'core.hooksPath');
  const hooks = inspectHooks(repoRoot);
  const hooksPathOk = hooksPath === EXPECTED_HOOKS_PATH;
  const allHooksPresent = hooks.every((h) => h.present);
  const allHooksCallKit = hooks.every((h) => h.callsKit);
  const hooksWired = hooksPathOk && allHooksPresent && allHooksCallKit;
  if (!hooksPathOk) {
    driftReasons.push(
      `core.hooksPath is '${hooksPath || '(unset)'}', expected '${EXPECTED_HOOKS_PATH}'`,
    );
  }
  const missing = hooks.filter((h) => !h.present).map((h) => h.name);
  if (missing.length) driftReasons.push(`missing hook(s): ${missing.join(', ')}`);
  const bespoke = hooks.filter((h) => h.present && !h.callsKit).map((h) => h.name);
  if (bespoke.length) {
    driftReasons.push(
      `hook(s) do not call the kit (bespoke/forked, bypassing porter-release): ${bespoke.join(', ')}`,
    );
  }

  // --- kitVersion pin ---
  const kitVersion = manifest?.kitVersion;
  const kitVersionOk = manifest !== null && kitVersion === KIT_VERSION;
  if (manifest !== null && !kitVersionOk) {
    driftReasons.push(`kitVersion pin '${kitVersion}' != current KIT_VERSION '${KIT_VERSION}' (stale)`);
  }

  // --- version file ---
  let versionFilePresent = false;
  if (manifest !== null) {
    versionFilePresent = existsSync(join(repoRoot, manifest.versionFile));
    if (!versionFilePresent) {
      driftReasons.push(`declared versionFile '${manifest.versionFile}' does not exist`);
    }
  } else {
    driftReasons.push('version file unknowable — no valid manifest declares versionFile');
  }

  // --- last release (informational) ---
  const lastRelease = manifest ? readLastRelease(repoRoot, manifest) : undefined;

  const wired = manifestValid && hooksWired && kitVersionOk && versionFilePresent;

  return {
    repoRoot,
    gitRepo,
    wired,
    manifestValid,
    hooksWired,
    kitVersionOk,
    versionFilePresent,
    driftReasons,
    lastRelease,
    hooksPath,
    hooks,
    kitVersion,
  };
}

/** Load a manifest for audit, distinguishing missing vs invalid without throwing. */
function loadForAudit(project: RegistryProject): { manifest: ReleaseManifest | null; error?: string } {
  try {
    return { manifest: loadManifest(project.repoRoot) };
  } catch (e) {
    if (e instanceof ManifestError) return { manifest: null, error: e.message };
    return { manifest: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Audit one registered project by id. Returns undefined for unknown ids. */
export function auditProjectById(id: string): ProjectAudit | undefined {
  const project = PROJECT_REGISTRY.find((p) => p.id === id);
  if (!project) return undefined;
  const { manifest, error } = loadForAudit(project);
  return { project: project.id, ...auditProject(project.repoRoot, manifest, error) };
}

export type Verdict = 'consistent' | 'drift';

export interface AuditReport {
  /** 'consistent' only when EVERY registered project is wired; else 'drift'. */
  verdict: Verdict;
  /** count of projects fully wired to the kit. */
  wiredCount: number;
  /** total registered projects audited. */
  total: number;
  generatedAt: string;
  kitVersion: string;
  projects: ProjectAudit[];
}

/**
 * Audit EVERY registered project and roll up a top-line verdict. Read-only.
 * Today (R2, pre-migration) the expected verdict is 'drift' with wiredCount=0 —
 * no repo carries a manifest yet; R3+ wires them one at a time.
 */
export function auditAll(): AuditReport {
  const projects = PROJECT_REGISTRY.map((p) => {
    const { manifest, error } = loadForAudit(p);
    return { project: p.id, ...auditProject(p.repoRoot, manifest, error) };
  });
  const wiredCount = projects.filter((p) => p.wired).length;
  return {
    verdict: wiredCount === projects.length && projects.length > 0 ? 'consistent' : 'drift',
    wiredCount,
    total: projects.length,
    generatedAt: new Date().toISOString(),
    kitVersion: KIT_VERSION,
    projects,
  };
}
