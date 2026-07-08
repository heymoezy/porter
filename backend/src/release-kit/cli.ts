#!/usr/bin/env node
/**
 * release-kit — `porter-release` CLI (R1).
 *
 * Commands:
 *   porter-release gate            pre-commit contract check on the cwd repo (shim target)
 *   porter-release run [--dry]     post-commit run sequence on the cwd repo (shim target)
 *   porter-release check <project> validate a registered project has a valid manifest
 *   porter-release announce --dry  render the cwd repo's latest release note (adapter preview)
 *
 * Invoke via: npx tsx src/release-kit/cli.ts <cmd>   (from backend/)
 * Or wire a bin entry "porter-release" once the kit is packaged (R3+).
 *
 * repoRoot resolves from cwd via `git rev-parse --show-toplevel`, overridable
 * with --repo <path> (used by isolated tests against throwaway fixtures).
 */
import { spawnSync } from 'node:child_process';
import { loadManifest, ManifestError } from './manifest-schema.js';
import { runGate } from './gate.js';
import { run, readLatestReleaseNote } from './run.js';
import { announceViaYmc } from './announce-adapter.js';
import { getProject, expectedManifestPath } from './project-registry.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function resolveRepoRoot(): string {
  const override = arg('--repo');
  if (override) return override;
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('[porter-release] not inside a git repo (git rev-parse --show-toplevel failed). Use --repo <path>.');
    process.exit(2);
  }
  return res.stdout.trim();
}

function stagedFiles(repoRoot: string): string[] {
  const res = spawnSync('git', ['-C', repoRoot, 'diff', '--cached', '--name-only'], { encoding: 'utf8' });
  if (res.status !== 0) return [];
  return res.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'gate': {
      const repoRoot = resolveRepoRoot();
      let manifest;
      try {
        manifest = loadManifest(repoRoot);
      } catch (e) {
        console.error(`[porter-release gate] ✗ ${e instanceof ManifestError ? e.message : e}`);
        process.exit(1);
      }
      const result = runGate({ repoRoot, stagedFiles: stagedFiles(repoRoot), manifest });
      for (const n of result.notes) console.log(`[porter-release gate] · ${n}`);
      if (!result.ok) {
        for (const r of result.refusals) console.error(`[porter-release gate] ✗ ${r}`);
        console.error('[porter-release gate] REFUSED — commit blocked.');
        process.exit(1);
      }
      console.log('[porter-release gate] ✓ contract satisfied.');
      process.exit(0);
      break;
    }

    case 'run': {
      const repoRoot = resolveRepoRoot();
      const dry = has('--dry');
      let manifest;
      try {
        manifest = loadManifest(repoRoot);
      } catch (e) {
        console.error(`[porter-release run] ✗ ${e instanceof ManifestError ? e.message : e}`);
        process.exit(1);
      }
      const result = await run({ repoRoot, manifest, dry });
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'check': {
      const positional = process.argv[3];
      const projectId = positional && !positional.startsWith('--') ? positional : undefined;
      let repoRoot: string;
      if (projectId) {
        const proj = getProject(projectId);
        if (!proj) {
          console.error(`[porter-release check] ✗ unknown project '${projectId}'. Not in the registry.`);
          process.exit(1);
        }
        repoRoot = proj.repoRoot;
        console.log(`[porter-release check] project=${proj.id} root=${repoRoot}`);
        console.log(`[porter-release check] expected manifest: ${expectedManifestPath(proj)}`);
      } else {
        repoRoot = resolveRepoRoot();
        console.log(`[porter-release check] cwd repo root=${repoRoot}`);
      }
      try {
        const m = loadManifest(repoRoot);
        console.log(`[porter-release check] ✓ valid manifest — project=${m.project} kind=${m.kind} kitVersion=${m.kitVersion}`);
        console.log(`[porter-release check]   versionFile=${m.versionFile} changelog=${m.changelogPath}${m.releaseFeed ? ` feed=${m.releaseFeed}` : ''}`);
        console.log(`[porter-release check]   smoke=${m.test.smoke}${m.test.regression ? ` regression=${m.test.regression}` : ''} announce=${m.announce.mode}/${m.announce.kind}`);
        process.exit(0);
      } catch (e) {
        console.error(`[porter-release check] ✗ ${e instanceof ManifestError ? e.message : e}`);
        process.exit(1);
      }
      break;
    }

    case 'announce': {
      const repoRoot = resolveRepoRoot();
      const dry = has('--dry');
      let manifest;
      try {
        manifest = loadManifest(repoRoot);
      } catch (e) {
        console.error(`[porter-release announce] ✗ ${e instanceof ManifestError ? e.message : e}`);
        process.exit(1);
      }
      if (manifest.announce.mode !== 'ymc-http') {
        console.log(`[porter-release announce] announce.mode=${manifest.announce.mode} — nothing to send.`);
        process.exit(0);
      }
      const note = readLatestReleaseNote(repoRoot, manifest);
      const res = await announceViaYmc({
        kind: manifest.announce.kind,
        version: note.version,
        title: note.title,
        bullets: note.bullets,
        endpoint: manifest.announce.endpoint,
        dry,
      });
      console.log('--- announce preview ---');
      console.log(res.preview);
      console.log('------------------------');
      if (!dry) console.log(`[porter-release announce] ${res.ok ? (res.sent ? 'sent ✅' : res.skipped ? 'skipped (idempotent)' : 'ok') : `FAILED: ${res.error}`}`);
      else console.log('[porter-release announce] DRY — not sent.');
      process.exit(res.ok ? 0 : 1);
      break;
    }

    default:
      console.error('usage: porter-release <gate|run|check <project>|announce> [--dry] [--repo <path>]');
      process.exit(2);
  }
}

main().catch((e) => {
  console.error('[porter-release] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
