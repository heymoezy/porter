/**
 * release-kit — project registry (R1).
 *
 * The canonical SOT list of the projects Porter enforces release consistency
 * across. Porter validates every repo against THIS list (R2 audit). Repo roots
 * are the real on-disk directory names (confirmed via projects.md + ls, which
 * differ from the tidy ids: themozaic lives at `themozaic.com`, baanyindee at
 * `Baan Yin Dee`).
 *
 * R1 = the static list only. No filesystem scan, no API. `manifestPath` is the
 * expected location of each repo's release.manifest.json (none exist yet —
 * repos are wired in R3+).
 */
import { join } from 'node:path';
import { MANIFEST_FILENAME } from './manifest-schema.js';

const PROJECTS_DIR = '/home/lobster/projects';

export interface RegistryProject {
  /** stable id used in manifests + announce routing. */
  id: string;
  /** announce intake kind for the project's primary releases. */
  kind: 'ymc-platform' | 'porter' | 'themozaic' | 'baanyindee';
  /** absolute repo root (real on-disk dir name). */
  repoRoot: string;
  /** whether the project is a tech PRODUCT with a release ceremony today.
   *  baanyindee is currently a docs-only matter with no stack — listed for
   *  completeness but not yet release-wired (see note below). */
  productized: boolean;
}

export const PROJECT_REGISTRY: readonly RegistryProject[] = [
  {
    id: 'ymc.capital',
    kind: 'ymc-platform',
    repoRoot: join(PROJECTS_DIR, 'ymc.capital'),
    productized: true,
  },
  {
    id: 'porter',
    kind: 'porter',
    repoRoot: join(PROJECTS_DIR, 'Porter'),
    productized: true,
  },
  {
    id: 'themozaic',
    kind: 'themozaic',
    repoRoot: join(PROJECTS_DIR, 'themozaic.com'),
    productized: true,
  },
  {
    id: 'baanyindee',
    kind: 'baanyindee',
    // NOTE: on-disk dir is "Baan Yin Dee" and is currently docs-only (no repo
    // stack). Listed as the 4th product per the ratified design; release-wiring
    // deferred until it has a version file + changelog (R5).
    repoRoot: join(PROJECTS_DIR, 'Baan Yin Dee'),
    productized: false,
  },
] as const;

export type ProjectId = (typeof PROJECT_REGISTRY)[number]['id'];

export function getProject(id: string): RegistryProject | undefined {
  return PROJECT_REGISTRY.find((p) => p.id === id);
}

/** Look up a registered project by an absolute repo root (normalized compare). */
export function getProjectByRoot(repoRoot: string): RegistryProject | undefined {
  const norm = repoRoot.replace(/\/+$/, '');
  return PROJECT_REGISTRY.find((p) => p.repoRoot.replace(/\/+$/, '') === norm);
}

/** Expected absolute path of a project's release.manifest.json. */
export function expectedManifestPath(p: RegistryProject): string {
  return join(p.repoRoot, MANIFEST_FILENAME);
}
