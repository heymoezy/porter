/**
 * Reorg #28 — safe duplicate-file REPORTER (execute flag defaults OFF).
 *
 * Scans ~/projects for byte-identical duplicate files, groups them, proposes ONE
 * canonical location per set, and reports reclaimable bytes. It is SAFE by
 * construction:
 *   - default mode is 'report' — reads only, changes nothing.
 *   - mode 'hardlink' would replace dupes with hardlinks to the canonical (fully
 *     reversible; same inode, no data loss). It is NOT invoked from the endpoint
 *     and requires an explicit opt-in.
 *   - deletion is NOT implemented here — "delete only after canonical chosen" is a
 *     manual, reviewed step in the runbook, never automated by this module.
 *
 * EXCLUSIONS (never touched, never counted): app-managed storage that is UUID/DB
 * referenced (ymc.capital/storage, datarooms/raw), personal dirs (moe-personal,
 * Estate, tax), and VCS/build/cache noise (.git, node_modules, dist, .cache).
 *
 * Hashing is size-bucketed: files are grouped by size first and only size
 * collisions are hashed, so a full ~/projects pass stays cheap.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const HOME = process.env.HOME || os.homedir();
const DEFAULT_ROOT = path.join(HOME, 'projects');

/** Directory names pruned during the walk (never descended into). */
const PRUNE_DIR_NAMES = new Set([
  '.git', 'node_modules', 'dist', 'build', '.cache', '.next', '.turbo',
  'storage', 'raw', // app-managed / UUID-referenced blob stores
  'moe-personal', 'Estate', // personal
  '.venv', 'venv', '__pycache__', '.pytest_cache',
]);

/** Absolute path fragments that force-exclude regardless of depth. */
const PRUNE_PATH_FRAGMENTS = [
  path.join('ymc.capital', 'storage'),
  path.join('datarooms', 'raw'),
  path.sep + 'tax' + path.sep,
];

const MIN_SIZE = 4 * 1024; // ignore tiny files — churn, not reclaimable
const MAX_SIZE = 500 * 1024 * 1024; // skip absurdly large blobs from hashing

function isExcluded(abs: string): boolean {
  for (const frag of PRUNE_PATH_FRAGMENTS) if (abs.includes(frag)) return true;
  return false;
}

interface FileRec {
  path: string;
  size: number;
}

function walk(root: string): FileRec[] {
  const files: FileRec[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (PRUNE_DIR_NAMES.has(ent.name)) continue;
        if (isExcluded(abs + path.sep)) continue;
        stack.push(abs);
      } else if (ent.isFile()) {
        if (isExcluded(abs)) continue;
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        if (st.size < MIN_SIZE || st.size > MAX_SIZE) continue;
        files.push({ path: abs, size: st.size });
      }
    }
  }
  return files;
}

function sha256(file: string): string | null {
  try {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(file));
    return h.digest('hex');
  } catch {
    return null;
  }
}

export interface DupSet {
  hash: string;
  size: number;
  count: number;
  reclaimableBytes: number; // (count - 1) * size
  canonical: string;
  duplicates: string[];
  /** why this path was chosen canonical */
  canonicalReason: string;
}

export interface DedupReport {
  root: string;
  mode: 'report';
  executed: false;
  scannedFiles: number;
  hashedFiles: number;
  dupSets: number;
  totalReclaimableBytes: number;
  totalReclaimableGB: number;
  exclusions: { dirNames: string[]; pathFragments: string[]; minSizeBytes: number };
  sets: DupSet[];
  note: string;
}

/**
 * Canonical pick: prefer the shallowest path (fewest separators), then the
 * shortest string, then lexicographically smallest. This favours a primary,
 * top-level filing over the deep re-filed copies the audit found (Edward Chen
 * corpus filed 3-9×, Stablekey/Ovada duplicated under many sub-folders).
 */
function pickCanonical(paths: string[]): { canonical: string; reason: string } {
  const scored = [...paths].sort((a, b) => {
    const da = a.split(path.sep).length;
    const db = b.split(path.sep).length;
    if (da !== db) return da - db;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : 1;
  });
  return {
    canonical: scored[0],
    reason: 'shallowest path (fewest dirs), then shortest — favours the primary filing over re-filed copies',
  };
}

export interface DedupOptions {
  root?: string;
  /** cap number of dup sets returned (report stays bounded); scan is full */
  limitSets?: number;
}

/**
 * Build the dedup report. READ-ONLY. `mode` is always 'report' here; the hardlink
 * executor is a separate, explicitly-opted-in path not reachable from the endpoint.
 */
export function buildDedupReport(opts: DedupOptions = {}): DedupReport {
  const root = opts.root ?? DEFAULT_ROOT;
  const files = walk(root);

  // size bucket
  const bySize = new Map<number, FileRec[]>();
  for (const f of files) {
    const arr = bySize.get(f.size);
    if (arr) arr.push(f);
    else bySize.set(f.size, [f]);
  }

  const sets: DupSet[] = [];
  let hashedFiles = 0;
  for (const [size, group] of bySize) {
    if (group.length < 2) continue; // unique size → cannot be a dup
    const byHash = new Map<string, string[]>();
    for (const f of group) {
      const h = sha256(f.path);
      hashedFiles++;
      if (!h) continue;
      const arr = byHash.get(h);
      if (arr) arr.push(f.path);
      else byHash.set(h, [f.path]);
    }
    for (const [hash, paths] of byHash) {
      if (paths.length < 2) continue;
      const { canonical, reason } = pickCanonical(paths);
      const duplicates = paths.filter((p) => p !== canonical);
      sets.push({
        hash,
        size,
        count: paths.length,
        reclaimableBytes: (paths.length - 1) * size,
        canonical,
        duplicates,
        canonicalReason: reason,
      });
    }
  }

  sets.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  const totalReclaimableBytes = sets.reduce((s, x) => s + x.reclaimableBytes, 0);
  const limited = opts.limitSets ? sets.slice(0, opts.limitSets) : sets;

  return {
    root,
    mode: 'report',
    executed: false,
    scannedFiles: files.length,
    hashedFiles,
    dupSets: sets.length,
    totalReclaimableBytes,
    totalReclaimableGB: +(totalReclaimableBytes / 1024 ** 3).toFixed(3),
    exclusions: {
      dirNames: [...PRUNE_DIR_NAMES],
      pathFragments: PRUNE_PATH_FRAGMENTS,
      minSizeBytes: MIN_SIZE,
    },
    sets: limited,
    note:
      'REPORT ONLY — nothing moved, hardlinked or deleted. Per set: keep `canonical`, and either ' +
      'hardlink or (after review) delete each `duplicates` entry. App-managed storage and personal ' +
      'dirs are excluded from the scan entirely.',
  };
}

/**
 * Reversible executor — replace each duplicate with a hardlink to the canonical.
 * NOT called by the endpoint. Guarded: no-op unless `execute` is explicitly true.
 * Never deletes data (hardlink shares the inode; content is preserved). Provided
 * so the runbook has a real, safe mechanism; the operator invokes it deliberately.
 */
export function applyDedupHardlinks(
  report: DedupReport,
  execute = false,
): { execute: boolean; wouldLink: number; linked: number; errors: string[] } {
  const errors: string[] = [];
  let wouldLink = 0;
  let linked = 0;
  for (const set of report.sets) {
    for (const dup of set.duplicates) {
      wouldLink++;
      if (!execute) continue;
      try {
        const tmp = dup + '.reorg-tmp';
        fs.linkSync(set.canonical, tmp); // create hardlink first
        fs.renameSync(tmp, dup); // atomically replace
        linked++;
      } catch (e) {
        errors.push(`${dup}: ${(e as Error).message}`);
      }
    }
  }
  return { execute, wouldLink, linked, errors };
}
