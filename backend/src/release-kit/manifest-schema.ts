/**
 * release-kit — manifest schema (R1).
 *
 * `release.manifest.json` is the per-repo adapter: it declares the
 * project-specific paths + script names the SHARED kit ceremony needs. The kit
 * (gate + run + announce) is generic; everything project-specific lives here.
 *
 * SOT: this schema. Repos carry a committed release.manifest.json that must
 * validate against it. Ceremony (gate contract, run order, announce mechanics)
 * is owned by the kit and never duplicated per repo.
 *
 * R1 = schema + loader only. No server wiring, no registry API (R2).
 */
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Announce delivery kinds accepted by the ymc announcer intake. `tom` ships
 *  under the ymc-platform repo but announces as its own kind. */
export const RELEASE_KINDS = ['ymc-platform', 'tom', 'porter', 'themozaic', 'baanyindee'] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

/** Current kit contract version. Repos pin this in their manifest; a mismatch
 *  is a drift signal (enforced in R2 audit, not R1). */
export const KIT_VERSION = '1.0.0';

/** Canonical manifest filename each repo carries at its root. */
export const MANIFEST_FILENAME = 'release.manifest.json';

export const testSchema = z.object({
  /** npm script (or command) name run on every release; HALT on failure. */
  smoke: z.string().min(1),
  /** optional; run after smoke if declared. */
  regression: z.string().min(1).optional(),
});

export const announceSchema = z.object({
  /** 'ymc-http' = POST the shared ymc announcer; 'none' = no ceremony (yet). */
  mode: z.enum(['ymc-http', 'none']),
  /** intake kind the announcer renders for. */
  kind: z.enum(RELEASE_KINDS),
  /** optional override of the announcer endpoint (defaults handled in adapter). */
  endpoint: z.string().url().optional(),
});

export const manifestSchema = z.object({
  /** stable project id, must match a project-registry entry. */
  project: z.string().min(1),
  kind: z.enum(RELEASE_KINDS),
  /** repo-relative path to the file that carries the version string. */
  versionFile: z.string().min(1),
  /** repo-relative path to the changelog. */
  changelogPath: z.string().min(1),
  /** repo-relative path to the release-feed file (e.g. SITE_RELEASES /
   *  PORTER_RELEASES). Optional; when declared, the gate additionally requires
   *  it to be staged on a release. */
  releaseFeed: z.string().min(1).optional(),
  test: testSchema,
  /** optional project-specific deploy script name/path. */
  deploy: z.string().min(1).optional(),
  announce: announceSchema,
  githubRemote: z.string().min(1).default('origin'),
  defaultBranch: z.string().min(1).default('main'),
  /** kit contract this repo pins to. */
  kitVersion: z.string().min(1).default(KIT_VERSION),
});

export type ReleaseManifest = z.infer<typeof manifestSchema>;

export class ManifestError extends Error {}

/**
 * Read + validate `release.manifest.json` at the given repo root.
 * Throws ManifestError with a clear message on missing/invalid manifest.
 */
export function loadManifest(repoRoot: string): ReleaseManifest {
  const path = join(repoRoot, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new ManifestError(`no ${MANIFEST_FILENAME} at ${path} — repo not release-kit wired`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new ManifestError(`${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ManifestError(`${path} failed schema validation:\n${issues}`);
  }
  return parsed.data;
}
