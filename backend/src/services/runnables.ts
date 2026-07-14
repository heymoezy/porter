/**
 * #52 — the ONE registry for everything that runs.
 *
 * Moe: the concepts of agents, loops, hooks, goals and cron jobs overlap so badly that nobody can
 * say what is running. He is right, and it already cost him: "Fatburger Daily" — his FAT Brands /
 * Wiederhorn legal digest — stopped on 2026-06-18 and nobody noticed for 25 days, because it was
 * registered NOWHERE.
 *
 * THE RULE THIS ENFORCES: a thing that runs but is registered nowhere cannot be monitored, and dies
 * silently. So the registry does not ask to be told what exists — it DISCOVERS what exists, from the
 * systems that actually execute:
 *
 *   systemd --user timers   the real executors (21)
 *   ymc scheduler.manifest  desired state, but ymc-* only (17)
 *   Porter workflows table  Porter's own engine, a separate universe (21)
 *
 * A hand-maintained list would drift the moment someone adds a timer. A discovered one cannot: if it
 * runs, it is here — and anything that runs WITHOUT a manifest governing it is flagged `governed =
 * false` rather than quietly tolerated.
 *
 * STALENESS is the payload. Every job carries `max_silence_seconds`: how long it may go without a
 * success before something is wrong. A daily digest silent for 25 days must SCREAM. That single
 * field is the thing whose absence cost Moe his Fatburger email.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { pool } from '../db/client.js';

// NOTE: this is execFile (argument array, NO shell), not exec. Named `run` so it cannot be
// misread as the shell-invoking exec — every argument here is a literal, never interpolated.
const run = promisify(execFile);

const YMC_MANIFEST = '/home/lobster/projects/ymc.capital/ops/scheduler.manifest';

export interface Runnable {
  id: string;
  kind: 'agent' | 'job' | 'hook' | 'loop' | 'goal';
  name: string;
  owner: string | null;
  source: string;
  unit: string | null;
  schedule: string | null;
  desired_state: 'active' | 'paused' | 'manual';
  last_success_at: number | null;
  last_result: string | null;
  max_silence_seconds: number | null;
  governed: boolean;
  notes: string | null;
}

/** Owner is inferred from the unit prefix — the same convention the box already uses. */
function ownerOf(unit: string): string {
  if (unit.startsWith('ymc-') || unit.startsWith('tom-')) return 'ymc';
  if (unit.startsWith('porter')) return 'porter';
  if (unit.startsWith('journeyful')) return 'journeyful';
  if (unit.startsWith('openclaw') || unit.startsWith('vps-')) return 'infra';
  return 'unknown';
}

/**
 * How long may this job be silent before it is stale?
 *
 * Derived from its actual cadence with a 2.2x tolerance — a daily job that misses one run is not yet
 * an incident; one that misses two is. Never a hardcoded per-job list: that would rot exactly like
 * the thing it is meant to catch.
 */
function maxSilenceFor(nextElapse: number | null, lastTrigger: number | null, lastSuccess?: number | null): number | null {
  // A timer that has never fired has no LastTriggerUSec, so the period could not be computed and the
  // job got max_silence = null — which excludes it from staleness detection ENTIRELY. A newly
  // installed job was therefore invisible to the very check that exists to catch a job dying quietly.
  // That is the Fatburger hole, reopened inside the thing built to close it: the window where a job
  // is most likely to be misconfigured is exactly the window where nothing was watching it.
  //
  // So: anchor on the last trigger when there is one, and fall back to the last successful run (a
  // manual first run, which is how any sane person tests a new timer). Only give up when there is no
  // anchor at all.
  const anchor = lastTrigger ?? lastSuccess ?? null;
  if (!nextElapse || !anchor || nextElapse <= anchor) return null;
  const period = nextElapse - anchor;
  return Math.round(period * 2.2);
}

/** Desired state from ymc's manifest (the one place that already models this properly). */
async function ymcDesiredState(): Promise<Map<string, 'active' | 'paused' | 'manual'>> {
  const m = new Map<string, 'active' | 'paused' | 'manual'>();
  try {
    const txt = await readFile(YMC_MANIFEST, 'utf8');
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const [state, pattern] = t.split(/\s+/);
      if (!state || !pattern) continue;
      if (state === 'active' || state === 'paused' || state === 'manual') {
        m.set(pattern.replace(/\*$/, ''), state);
      }
    }
  } catch { /* manifest is optional */ }
  return m;
}

function desiredFor(unit: string, manifest: Map<string, 'active' | 'paused' | 'manual'>) {
  // First matching prefix wins — the manifest's own rule.
  for (const [pattern, state] of manifest) {
    if (unit.startsWith(pattern)) return { state, governed: true };
  }
  return { state: 'active' as const, governed: false };
}

/** Discover every systemd --user timer and what it actually did. */
async function discoverTimers(): Promise<Array<Omit<Runnable, 'id'>>> {
  const out: Array<Omit<Runnable, 'id'>> = [];
  let units: string[] = [];
  try {
    const { stdout } = await run('systemctl',
      ['--user', 'list-timers', '--all', '--no-pager', '--no-legend', '--plain'], { timeout: 5000 });
    units = stdout.split('\n').map((l) => (l.trim().match(/(\S+\.timer)/) || [])[1]).filter(Boolean) as string[];
  } catch { return out; }

  const manifest = await ymcDesiredState();

  for (const timer of [...new Set(units)]) {
    const base = timer.replace(/\.timer$/, '');
    const svc = `${base}.service`;
    let props: Record<string, string> = {};
    try {
      const { stdout } = await run('systemctl',
        ['--user', 'show', timer, '-p', 'NextElapseUSecRealtime', '-p', 'LastTriggerUSec', '-p', 'Description'],
        { timeout: 4000 });
      const { stdout: s2 } = await run('systemctl',
        ['--user', 'show', svc, '-p', 'Result', '-p', 'ExecMainExitTimestamp'], { timeout: 4000 });
      for (const line of (stdout + '\n' + s2).split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) props[line.slice(0, i)] = line.slice(i + 1);
      }
    } catch { /* keep going — a unit we cannot read is still a unit that exists */ }

    const parseTs = (v?: string): number | null => {
      if (!v || v === 'n/a' || v === '0') return null;
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t / 1000;
    };
    const lastTrigger = parseTs(props.LastTriggerUSec);
    const nextElapse = parseTs(props.NextElapseUSecRealtime);
    const result = props.Result || 'unknown';
    const exitAt = parseTs(props.ExecMainExitTimestamp);

    const { state, governed } = desiredFor(base, manifest);

    out.push({
      kind: 'job',
      name: base,
      owner: ownerOf(base),
      source: 'systemd',
      unit: svc,
      schedule: nextElapse ? `next ${new Date(nextElapse * 1000).toISOString()}` : null,
      desired_state: state,
      last_success_at: result === 'success' ? (exitAt ?? lastTrigger) : null,
      last_result: result,
      max_silence_seconds: maxSilenceFor(nextElapse, lastTrigger, result === 'success' ? (exitAt ?? null) : null),
      governed,
      notes: props.Description || null,
    });
  }
  return out;
}

/**
 * A workflow's cadence tag → how long it may be silent before something is wrong.
 * Same 2.2x tolerance as the systemd timers: one missed run is not an incident, two is.
 */
const WORKFLOW_PERIODS: Record<string, number> = {
  every_30m: 30 * 60,
  every_6h: 6 * 3600,
  every_24h: 24 * 3600,
  every_week: 7 * 24 * 3600,
};

function workflowSilenceFor(triggerValue: string | null): number | null {
  const period = triggerValue ? WORKFLOW_PERIODS[triggerValue] : undefined;
  // An unrecognised cadence gets NO staleness rule rather than a guessed one — a made-up threshold
  // pages Moe about a job that is fine, and false alarms are how alerting gets ignored.
  return period ? Math.round(period * 2.2) : null;
}

/** Porter's own workflow engine — a real registry, but only of Porter's things. */
async function discoverWorkflows(): Promise<Array<Omit<Runnable, 'id'>>> {
  const { rows } = await pool.query(
    `SELECT name, trigger_type, trigger_value, enabled, last_run_at FROM workflows`,
  );
  return (rows as Array<{ name: string; trigger_type: string; trigger_value: string | null; enabled: boolean; last_run_at: number | null }>)
    .map((w) => ({
      kind: 'job' as const,
      name: w.name,
      owner: 'porter',
      source: 'porter-workflows',
      unit: null,
      schedule: w.trigger_value ?? w.trigger_type,
      desired_state: (w.enabled ? 'active' : 'manual') as 'active' | 'manual',
      last_success_at: w.last_run_at,
      last_result: w.last_run_at ? 'success' : 'unknown',
      // Event-triggered workflows have no cadence, so silence means nothing for them.
      // Scheduled ones get 2.2x their OWN period — the same rule as the timers above. This used to
      // be a flat 48h for every scheduled workflow, which called a WEEKLY job stale after two days
      // and would have paged Moe about a job that was running perfectly.
      max_silence_seconds: w.trigger_type === 'schedule' ? workflowSilenceFor(w.trigger_value) : null,
      governed: true,
      notes: `porter workflow (${w.trigger_type})`,
    }));
}

/** Reconcile discovery → the registry. Discovered, never hand-maintained. */
export async function reconcileRunnables(): Promise<{ discovered: number; stale: number }> {
  const now = Date.now() / 1000;
  const found = [...(await discoverTimers()), ...(await discoverWorkflows())];

  for (const r of found) {
    const id = `${r.source}:${r.name}`;
    await pool.query(
      `INSERT INTO runnables (id, kind, name, owner, source, unit, schedule, desired_state,
                              last_success_at, last_result, max_silence_seconds, governed, notes,
                              first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       ON CONFLICT (id) DO UPDATE SET
         kind=$2, name=$3, owner=$4, unit=$6, schedule=$7, desired_state=$8,
         -- never regress a known success to null on a transient read failure
         last_success_at = COALESCE($9, runnables.last_success_at),
         last_result=$10, max_silence_seconds=$11, governed=$12, notes=$13, last_seen_at=$14`,
      [id, r.kind, r.name, r.owner, r.source, r.unit, r.schedule, r.desired_state,
       r.last_success_at, r.last_result, r.max_silence_seconds, r.governed, r.notes, now],
    );
  }

  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM runnables WHERE ${STALE_SQL}`);
  return { discovered: found.length, stale: (rows[0] as { n: number }).n };
}

/**
 * STALE — the whole point of the registry.
 *
 * A job whose desired state is `active`, that has a known cadence, and that has not SUCCEEDED within
 * ~2 of its own periods. This is the condition that was true of Fatburger Daily for 25 days while
 * nothing anywhere noticed.
 */
export const STALE_SQL = `
  desired_state = 'active'
  AND max_silence_seconds IS NOT NULL
  AND (last_success_at IS NULL
       OR extract(epoch from now()) - last_success_at > max_silence_seconds)
`;

export async function listRunnables(): Promise<{
  runnables: Array<Runnable & { stale: boolean; silent_for_seconds: number | null }>;
  summary: { total: number; stale: number; ungoverned: number; byKind: Record<string, number> };
}> {
  const { rows } = await pool.query(
    `SELECT *,
            (${STALE_SQL}) AS stale,
            CASE WHEN last_success_at IS NULL THEN NULL
                 ELSE round(extract(epoch from now()) - last_success_at)::bigint END AS silent_for_seconds
       FROM runnables
      ORDER BY (${STALE_SQL}) DESC, governed ASC, owner, name`,
  );
  const list = rows as Array<Runnable & { stale: boolean; silent_for_seconds: number | null }>;
  const byKind: Record<string, number> = {};
  for (const r of list) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return {
    runnables: list,
    summary: {
      total: list.length,
      stale: list.filter((r) => r.stale).length,
      ungoverned: list.filter((r) => !r.governed).length,
      byKind,
    },
  };
}
