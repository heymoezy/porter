/**
 * GitHub scanner — the `github_scan` workflow action
 * (vault/concepts/worker-knowledge-loop.md, step 4).
 *
 * Watches the repos in ops/github-watchlist.txt (GITHUB_WATCHLIST_PATH env
 * overrides) for new releases + security advisories via the authed `gh` CLI.
 * The scan itself is ZERO-LLM (gh api + local diff against
 * <PORTER_DATA_DIR>/runtime/github-scan-state.json); the cheap gateway (worker-knowledge
 * CHEAP_GATEWAY — never premium) is invoked ONLY when something changed, to
 * write a "what this means for our stack" paragraph. Output: ONE digest
 * proposal in the existing memory_proposals review queue — human accepts,
 * nothing auto-applies.
 *
 * Cadence: WEEKLY, but riding the EXISTING every_24h workflow tick (no new
 * timers, per the no-patchwork rule) — the state file's last_scan_at gates
 * scheduled runs; manual triggers always run.
 *
 * First sighting of a repo BASELINES it silently (records current ids, no
 * digest) so a fresh state file never floods the queue with old history.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { logIntellectEvent } from './file-watcher.js';
import { broadcast } from '../sse-hub.js';
import { dispatchCheap, CHEAP_GATEWAY } from './worker-knowledge.js';

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEK_FLOOR_S = Math.floor(7 * 86400 * 0.95); // 95% floor, same convention as dream cadence
// Runtime state home is <PORTER_DATA_DIR>/runtime/ (gitignored).
const STATE_FILE = () => path.join(config.dataDir, 'runtime', 'github-scan-state.json');
const GH_TIMEOUT_MS = 20_000;
const RELEASES_PER_REPO = 5;
const ADVISORIES_PER_REPO = 10;
const SEEN_CAP = 40; // ids remembered per repo
const EXPIRES_IN_S = 30 * 86400;
const PROPOSALS_SILO = 'workers'; // same review-queue label as worker_knowledge_refresh

interface RepoState {
  release_ids: number[];
  advisory_ids: string[];
}
interface ScanState {
  last_scan_at?: number;
  repos?: Record<string, RepoState>;
}

interface ReleaseItem {
  repo: string;
  id: number;
  tag: string;
  name: string;
  url: string;
  published_at: string;
  prerelease: boolean;
}
interface AdvisoryItem {
  repo: string;
  ghsa_id: string;
  severity: string;
  summary: string;
  url: string;
}

export interface GithubScanResult {
  skipped?: string;
  repos_scanned?: number;
  baselined?: number;
  new_releases?: number;
  new_advisories?: number;
  errors?: number;
  proposal_id?: string;
  llm_used?: boolean;
}

// ── Watchlist ────────────────────────────────────────────────────────────────

function watchlistPath(): string {
  if (process.env.GITHUB_WATCHLIST_PATH) return process.env.GITHUB_WATCHLIST_PATH;
  // dist/services/intellect → repo root (same climb as dream-worker.ts)
  const repoRoot = process.env.PORTER_REPO_ROOT ?? path.resolve(__dirname, '../../../..');
  return path.resolve(repoRoot, 'ops/github-watchlist.txt');
}

export async function readWatchlist(): Promise<string[]> {
  const raw = await fs.readFile(watchlistPath(), 'utf8');
  return raw
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(l => /^[\w.-]+\/[\w.-]+$/.test(l));
}

// ── State ────────────────────────────────────────────────────────────────────

async function readState(): Promise<ScanState> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE(), 'utf8')) as ScanState;
  } catch {
    return {};
  }
}
async function writeState(state: ScanState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE()), { recursive: true });
  await fs.writeFile(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
}

// ── gh api (zero-LLM) ────────────────────────────────────────────────────────

// Capability detection (Porter architecture rule 3): the systemd service PATH
// omits ~/.local/bin where gh commonly installs, so resolve the binary from
// candidates instead of assuming PATH. GH_BIN env is the explicit override.
let ghBinCached: string | null = null;
async function resolveGhBin(): Promise<string> {
  if (ghBinCached) return ghBinCached;
  const candidates = [
    process.env.GH_BIN,
    path.join(os.homedir(), '.local/bin/gh'),
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    'gh', // last resort: whatever PATH has
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    if (c === 'gh') break; // can't fs.access a bare name — just try it
    try {
      await fs.access(c);
      ghBinCached = c;
      return c;
    } catch {
      /* next candidate */
    }
  }
  ghBinCached = 'gh';
  return ghBinCached;
}

async function ghJson<T>(endpoint: string): Promise<T> {
  const bin = await resolveGhBin();
  const { stdout } = await execFileP(bin, ['api', endpoint], {
    timeout: GH_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
  return JSON.parse(stdout) as T;
}

async function fetchRepo(repo: string): Promise<{ releases: ReleaseItem[]; advisories: AdvisoryItem[] }> {
  const releasesRaw = await ghJson<Array<{
    id: number; tag_name: string; name: string | null; html_url: string;
    published_at: string; prerelease: boolean; draft: boolean;
  }>>(`repos/${repo}/releases?per_page=${RELEASES_PER_REPO}`);
  const releases = releasesRaw
    .filter(r => !r.draft)
    .map(r => ({
      repo,
      id: r.id,
      tag: r.tag_name,
      name: r.name ?? r.tag_name,
      url: r.html_url,
      published_at: r.published_at,
      prerelease: r.prerelease,
    }));
  // Repo-owned security advisories — many repos 404/empty here; treat as none.
  const advisoriesRaw = await ghJson<Array<{
    ghsa_id: string; severity: string; summary: string; html_url: string;
  }>>(`repos/${repo}/security-advisories?per_page=${ADVISORIES_PER_REPO}`).catch(() => []);
  const advisories = advisoriesRaw.map(a => ({
    repo,
    ghsa_id: a.ghsa_id,
    severity: a.severity,
    summary: a.summary,
    url: a.html_url,
  }));
  return { releases, advisories };
}

// ── Digest rendering (deterministic) ─────────────────────────────────────────

function renderDigest(
  today: string,
  newReleases: ReleaseItem[],
  newAdvisories: AdvisoryItem[],
  llmSummary: string | null,
): string {
  const lines: string[] = [`GitHub watchlist digest (${today})`, ''];
  if (llmSummary) lines.push(llmSummary, '');
  if (newAdvisories.length > 0) {
    lines.push('Security advisories:');
    for (const a of newAdvisories) lines.push(`- [${a.severity}] ${a.repo}: ${a.summary} — ${a.url}`);
    lines.push('');
  }
  if (newReleases.length > 0) {
    lines.push('New releases:');
    for (const r of newReleases) {
      lines.push(`- ${r.repo} ${r.tag}${r.prerelease ? ' (pre-release)' : ''} — ${r.name} (${r.published_at.slice(0, 10)}) ${r.url}`);
    }
  }
  return lines.join('\n').trim();
}

// ── Main entry — the `github_scan` workflow action ───────────────────────────

export async function runGithubScan(opts: { triggeredBy: 'schedule' | 'manual' } = { triggeredBy: 'schedule' }): Promise<GithubScanResult> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const state = await readState();

  // Weekly cadence via state-file day-check (rides the every_24h tick).
  if (opts.triggeredBy === 'schedule' && state.last_scan_at && nowEpoch - state.last_scan_at < WEEK_FLOOR_S) {
    return { skipped: 'within weekly cadence floor' };
  }

  const repos = await readWatchlist();
  if (repos.length === 0) return { skipped: 'watchlist empty' };

  const repoStates = state.repos ?? {};
  const newReleases: ReleaseItem[] = [];
  const newAdvisories: AdvisoryItem[] = [];
  let baselined = 0;
  let errors = 0;

  for (const repo of repos) {
    try {
      const { releases, advisories } = await fetchRepo(repo);
      const prev = repoStates[repo];
      if (!prev) {
        // First sighting — baseline silently, never flood with history.
        repoStates[repo] = {
          release_ids: releases.map(r => r.id).slice(0, SEEN_CAP),
          advisory_ids: advisories.map(a => a.ghsa_id).slice(0, SEEN_CAP),
        };
        baselined++;
        continue;
      }
      const seenR = new Set(prev.release_ids);
      const seenA = new Set(prev.advisory_ids);
      const freshR = releases.filter(r => !seenR.has(r.id));
      const freshA = advisories.filter(a => !seenA.has(a.ghsa_id));
      newReleases.push(...freshR);
      newAdvisories.push(...freshA);
      repoStates[repo] = {
        release_ids: [...freshR.map(r => r.id), ...prev.release_ids].slice(0, SEEN_CAP),
        advisory_ids: [...freshA.map(a => a.ghsa_id), ...prev.advisory_ids].slice(0, SEEN_CAP),
      };
    } catch (e) {
      errors++;
      console.warn(`[github-scan] ${repo} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Persist state FIRST (a broken digest insert must not re-announce next week).
  state.last_scan_at = nowEpoch;
  state.repos = repoStates;
  await writeState(state);

  const result: GithubScanResult = {
    repos_scanned: repos.length,
    baselined,
    new_releases: newReleases.length,
    new_advisories: newAdvisories.length,
    errors,
  };

  if (newReleases.length === 0 && newAdvisories.length === 0) {
    // Quiet week (or pure baseline run) — silent, zero LLM, no proposal.
    if (baselined > 0 || errors > 0) {
      await logIntellectEvent('github_scan', 'github_scan', { ...result, quiet: true });
    }
    return result;
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

  // LLM (CHEAP gateway only — see worker-knowledge.ts CHEAP_GATEWAY) purely to
  // summarize what changed for OUR stack. Failure falls back to the
  // deterministic digest — the scan itself never depends on a model.
  let llmSummary: string | null = null;
  let llmTokens: number | null = null;
  try {
    const prompt = [
      'You are summarizing a GitHub watchlist digest for an ops review queue. Our stack: Porter',
      '(Fastify/TypeScript/Postgres backbone with claude_cli + codex_cli gateways), ymc.capital',
      '(Fastify + React Router + Drizzle), Tom (WhatsApp agent on the openclaw gateway — we carry',
      'local patches + PR #100500 against openclaw/openclaw). In ONE short paragraph (<120 words),',
      'plain declarative register: what below matters for us, what is ignorable, and whether anything',
      'looks breaking or security-relevant. No preamble, no bullets.',
      '',
      renderDigest(today, newReleases, newAdvisories, null),
    ].join('\n');
    const r = await dispatchCheap(prompt, 'github-scan');
    llmSummary = r.response.trim().slice(0, 1200) || null;
    llmTokens = r.outputTokens ?? null;
  } catch (e) {
    console.warn(`[github-scan] cheap-gateway summary failed (deterministic digest used): ${e instanceof Error ? e.message : String(e)}`);
  }

  const proposalId = 'mp_' + randomUUID();
  await pool.query(
    `INSERT INTO memory_proposals
       (id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
        proposed_content, proposed_metadata, source_evidence, sort_order, expires_at)
     VALUES ($1, $2, $3, 'new_directive', '{}'::text[], $4, $5::jsonb, $6::jsonb, 0,
             EXTRACT(EPOCH FROM NOW()) + $7)`,
    [
      proposalId,
      'ghs_' + randomUUID(), // synthetic run id (no dream_runs row; no consumer joins it)
      PROPOSALS_SILO,
      renderDigest(today, newReleases, newAdvisories, llmSummary),
      JSON.stringify({
        source: 'github_scan',
        source_type: 'github_scan',
        priority: 50,
        conceptual_area: 'github-scan:digest',
        gateway: llmSummary ? CHEAP_GATEWAY : null,
      }),
      JSON.stringify({
        repos,
        new_release_ids: newReleases.map(r => `${r.repo}#${r.id}`),
        new_advisory_ids: newAdvisories.map(a => `${a.repo}#${a.ghsa_id}`),
        scanned_at: today,
      }),
      EXPIRES_IN_S,
    ],
  );
  broadcast('proposals:created', { dream_run_id: null, silo_id: PROPOSALS_SILO, count: 1 });
  await logIntellectEvent('github_scan', 'github_scan', {
    ...result,
    proposal_id: proposalId,
    llm_used: !!llmSummary,
    llm_output_tokens: llmTokens,
  });
  return { ...result, proposal_id: proposalId, llm_used: !!llmSummary };
}
