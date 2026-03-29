/**
 * Usage Collector — reads actual usage from provider APIs and local CLI storage
 *
 * Populates gateway_rate_limits with real usage data from:
 *   1. Claude — minimal Haiku API call, reads rate-limit headers (provider-level, highest trust)
 *   2. Codex CLI — SQLite state_5.sqlite threads table
 *   3. Gemini CLI — dispatch_log counts (no local usage files)
 *   4. OpenClaw — sessions.json token sums (5hour + weekly windows)
 *
 * Called every 30 seconds by the scheduler alongside health probes.
 * Claude API call is rate-limited to once per 5 minutes (uses ~1 Haiku token = negligible cost).
 */

import { pool } from '../../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { emitSSE } from '../scheduler.js';

// ── Constants ────────────────────────────────────────────────────────────────

const HOME = process.env.HOME || '/home/lobster';
const CLAUDE_CREDENTIALS_PATH = path.join(HOME, '.claude', '.credentials.json');
const CODEX_SQLITE_PATH = path.join(HOME, '.codex', 'state_5.sqlite');
const OPENCLAW_SESSIONS_PATH = path.join(HOME, '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');

const CLAUDE_MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const FIVE_HOURS_SEC = 5 * 3600;
const SEVEN_DAYS_SEC = 7 * 24 * 3600;
const ONE_DAY_SEC = 24 * 3600;

// ── Claude API cache ─────────────────────────────────────────────────────────

interface ClaudeApiCache {
  lastCallMs: number;
  lastResult: {
    fiveHourUtilization: number;
    fiveHourReset: number | null;
    sevenDayUtilization: number;
    sevenDayReset: number | null;
    status: string;
  } | null;
}

const claudeApiCache: ClaudeApiCache = {
  lastCallMs: 0,
  lastResult: null,
};

// ── Gateway ID cache ────────────────────────────────────────────────────────

let gatewayIds: { claude: string; codex: string; gemini: string; openclaw?: string } | null = null;

async function getGatewayIds(): Promise<typeof gatewayIds> {
  if (gatewayIds) return gatewayIds;

  const { rows } = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM gateways WHERE type IN ('claude_cli', 'codex_cli', 'gemini_cli', 'openclaw')`,
  );

  const map: Record<string, string> = {};
  for (const r of rows) map[r.type] = r.id;

  if (!map.claude_cli || !map.codex_cli || !map.gemini_cli) {
    return null; // Some gateways not registered yet
  }

  gatewayIds = {
    claude: map.claude_cli,
    codex: map.codex_cli,
    gemini: map.gemini_cli,
    openclaw: map.openclaw, // optional — may not exist yet
  };
  return gatewayIds;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function collectLocalUsage(): Promise<void> {
  try {
    const ids = await getGatewayIds();
    if (!ids) return; // Gateways not configured yet

    const tasks = [
      collectClaudeUsage(ids.claude),
      collectCodexUsage(ids.codex),
      collectGeminiUsage(ids.gemini),
    ];
    if (ids.openclaw) tasks.push(collectOpenClawUsage(ids.openclaw));
    await Promise.allSettled(tasks);

    // Emit SSE so admin UI refreshes capacity in real-time
    emitSSE('bridge:usage', { ts: Date.now() }).catch(() => {});
  } catch (err) {
    console.error('[usage-collector] error:', err instanceof Error ? err.message : err);
  }
}

// ── Claude Usage (rate-limit headers from minimal Haiku call) ───────────────

/**
 * Makes a minimal API call to Anthropic (Haiku, max_tokens=1, message=".") and
 * reads the rate-limit utilization headers. This gives us the real 5-hour and
 * 7-day usage percentages directly from the provider.
 *
 * Cost: ~1 Haiku token per call = fractions of a cent.
 * Frequency: once per 5 minutes (cached).
 */
async function collectClaudeUsage(gatewayId: string): Promise<void> {
  const now = Date.now();

  // Rate limit: max once per 5 minutes
  if (now < claudeApiCache.lastCallMs + CLAUDE_API_MIN_INTERVAL_MS) {
    // Use cached result if available
    if (claudeApiCache.lastResult) {
      await upsertClaudeFromCache(gatewayId, claudeApiCache.lastResult, now / 1000);
    }
    return;
  }

  // Read and validate OAuth credentials
  let accessToken: string;
  try {
    const creds = JSON.parse(fs.readFileSync(CLAUDE_CREDENTIALS_PATH, 'utf-8'));
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) {
      console.warn('[usage-collector] No Claude OAuth access token in credentials');
      return;
    }

    // Check token expiry (expiresAt is in milliseconds)
    if (oauth.expiresAt && typeof oauth.expiresAt === 'number' && oauth.expiresAt < now) {
      console.warn('[usage-collector] Claude OAuth token expired at %s — skipping',
        new Date(oauth.expiresAt).toISOString());
      return;
    }

    accessToken = oauth.accessToken;
  } catch {
    return; // Credentials file missing or unreadable
  }

  claudeApiCache.lastCallMs = now;

  try {
    const resp = await fetch(CLAUDE_MESSAGES_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': accessToken,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    // Parse rate-limit headers regardless of response status
    // (headers are returned even on 4xx/5xx)
    const fiveHourUtil = parseFloat(resp.headers.get('anthropic-ratelimit-unified-5h-utilization') || '');
    const sevenDayUtil = parseFloat(resp.headers.get('anthropic-ratelimit-unified-7d-utilization') || '');
    const fiveHourReset = parseInt(resp.headers.get('anthropic-ratelimit-unified-5h-reset') || '', 10);
    const sevenDayReset = parseInt(resp.headers.get('anthropic-ratelimit-unified-7d-reset') || '', 10);
    const status = resp.headers.get('anthropic-ratelimit-unified-status') || 'unknown';

    // Validate we got real data
    if (isNaN(fiveHourUtil) && isNaN(sevenDayUtil)) {
      console.warn('[usage-collector] Claude API returned no rate-limit headers (status %d)', resp.status);
      return;
    }

    const result = {
      fiveHourUtilization: isNaN(fiveHourUtil) ? 0 : fiveHourUtil,
      fiveHourReset: isNaN(fiveHourReset) ? null : fiveHourReset,
      sevenDayUtilization: isNaN(sevenDayUtil) ? 0 : sevenDayUtil,
      sevenDayReset: isNaN(sevenDayReset) ? null : sevenDayReset,
      status,
    };

    claudeApiCache.lastResult = result;

    await upsertClaudeFromCache(gatewayId, result, now / 1000);

    console.log('[usage-collector] Claude usage: 5h=%s%% 7d=%s%% status=%s',
      (result.fiveHourUtilization * 100).toFixed(1),
      (result.sevenDayUtilization * 100).toFixed(1),
      result.status);
  } catch (err) {
    console.warn('[usage-collector] Claude API error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Upsert the cached Claude rate-limit data into gateway_rate_limits.
 *
 * Strategy: set limit_value=100 and current_value=utilization*100 so that
 * pct = current/limit = utilization. This makes the existing UI "X% used" work.
 */
async function upsertClaudeFromCache(
  gatewayId: string,
  data: NonNullable<ClaudeApiCache['lastResult']>,
  nowSec: number,
): Promise<void> {
  await Promise.allSettled([
    // 5-hour session window
    upsertUsageProvider(
      gatewayId,
      'requests',
      '5hour',
      Math.round(data.fiveHourUtilization * 10000) / 100, // e.g. 0.21 → 21.00
      100,
      data.fiveHourReset,
      nowSec,
    ),
    // 7-day weekly window
    upsertUsageProvider(
      gatewayId,
      'requests',
      'weekly',
      Math.round(data.sevenDayUtilization * 10000) / 100, // e.g. 0.14 → 14.00
      100,
      data.sevenDayReset,
      nowSec,
    ),
  ]);
}

/**
 * Upsert with source='provider' — highest trust, always overwrites.
 */
async function upsertUsageProvider(
  gatewayId: string,
  limitType: string,
  period: string,
  currentValue: number,
  limitValue: number | null,
  resetAt: number | null,
  now: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO gateway_rate_limits
       (id, gateway_id, model_name, limit_type, period, limit_value, current_value, reset_at, source, updated_at)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, 'provider', $8)
     ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
       current_value = EXCLUDED.current_value,
       limit_value = COALESCE(EXCLUDED.limit_value, gateway_rate_limits.limit_value),
       reset_at = COALESCE(EXCLUDED.reset_at, gateway_rate_limits.reset_at),
       source = 'provider',
       updated_at = EXCLUDED.updated_at`,
    [uuidv4(), gatewayId, limitType, period, limitValue, currentValue, resetAt, now],
  );
}

// ── Codex CLI ───────────────────────────────────────────────────────────────

async function collectCodexUsage(gatewayId: string): Promise<void> {
  if (!fs.existsSync(CODEX_SQLITE_PATH)) return;

  const nowSec = Date.now() / 1000;
  const fiveHourCutoff = nowSec - FIVE_HOURS_SEC;
  const weekCutoff = nowSec - SEVEN_DAYS_SEC;

  try {
    // Open read-only to avoid WAL lock conflicts with running Codex
    const db = new Database(CODEX_SQLITE_PATH, { readonly: true, fileMustExist: true });

    try {
      // 5-hour window
      const fiveHourRow = db.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_used), 0) as tokens, MIN(updated_at) as oldest
         FROM threads WHERE updated_at >= ?`,
      ).get(fiveHourCutoff) as { cnt: number; tokens: number; oldest: number | null };

      // Weekly window
      const weekRow = db.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_used), 0) as tokens, MIN(updated_at) as oldest
         FROM threads WHERE updated_at >= ?`,
      ).get(weekCutoff) as { cnt: number; tokens: number; oldest: number | null };

      const fiveHourResetAt = fiveHourRow.oldest !== null
        ? fiveHourRow.oldest + FIVE_HOURS_SEC
        : null;
      const weeklyResetAt = getNextSaturdayMidnightUtc(nowSec);

      await Promise.allSettled([
        upsertUsage(gatewayId, 'requests', '5hour', fiveHourRow.cnt, null, fiveHourResetAt, nowSec),
        upsertUsage(gatewayId, 'tokens', '5hour', fiveHourRow.tokens, null, fiveHourResetAt, nowSec),
        upsertUsage(gatewayId, 'requests', 'weekly', weekRow.cnt, null, weeklyResetAt, nowSec),
        upsertUsage(gatewayId, 'tokens', 'weekly', weekRow.tokens, null, weeklyResetAt, nowSec),
      ]);
    } finally {
      db.close();
    }
  } catch (err) {
    console.error('[usage-collector] codex sqlite error:', err instanceof Error ? err.message : err);
  }
}

// ── Gemini CLI ──────────────────────────────────────────────────────────────

async function collectGeminiUsage(gatewayId: string): Promise<void> {
  const nowSec = Date.now() / 1000;
  const dayCutoff = nowSec - ONE_DAY_SEC;
  const minuteCutoff = nowSec - 60;

  try {
    // Count dispatches to this gateway from bridge_dispatch_log
    const { rows } = await pool.query<{ period: string; cnt: string }>(`
      SELECT 'daily' AS period, COUNT(*)::text AS cnt
      FROM bridge_dispatch_log
      WHERE gateway_id = $1 AND created_at >= $2
      UNION ALL
      SELECT 'minute' AS period, COUNT(*)::text AS cnt
      FROM bridge_dispatch_log
      WHERE gateway_id = $1 AND created_at >= $3
    `, [gatewayId, dayCutoff, minuteCutoff]);

    const dailyResetAt = getNextMidnightUtc(nowSec);

    for (const row of rows) {
      const count = parseInt(row.cnt, 10);
      if (row.period === 'daily') {
        await upsertUsage(gatewayId, 'requests', 'daily', count, 1000, dailyResetAt, nowSec);
      } else if (row.period === 'minute') {
        await upsertUsage(gatewayId, 'requests', 'minute', count, 60, null, nowSec);
      }
    }
  } catch (err) {
    console.error('[usage-collector] gemini dispatch_log error:', err instanceof Error ? err.message : err);
  }
}

// ── OpenClaw (GPT-5.4) ──────────────────────────────────────────────────────

interface OpenClawStatusSession {
  totalTokens: number;
  contextTokens: number;
  percentUsed: number;
  age: number;  // ms since last update
  model: string;
}

async function collectOpenClawUsage(gatewayId: string): Promise<void> {
  const nowSec = Date.now() / 1000;

  try {
    // Use `openclaw status --json` for live data (not stale file)
    const raw = execSync('openclaw status --json 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
    const data = JSON.parse(raw);
    const recent: OpenClawStatusSession[] = data?.sessions?.recent ?? [];

    if (recent.length === 0) return;

    const fiveHourMs = FIVE_HOURS_SEC * 1000;
    const weekMs = SEVEN_DAYS_SEC * 1000;

    let fiveHourTokens = 0;
    let fiveHourSessions = 0;
    let weeklyTokens = 0;
    let weeklySessions = 0;
    let totalContextWindow = 0;
    let totalUsedInContext = 0;

    for (const s of recent) {
      const ageMs = s.age ?? Infinity;
      if (ageMs < weekMs) {
        weeklyTokens += s.totalTokens ?? 0;
        weeklySessions += 1;
      }
      if (ageMs < fiveHourMs) {
        fiveHourTokens += s.totalTokens ?? 0;
        fiveHourSessions += 1;
        totalContextWindow += s.contextTokens ?? 0;
        totalUsedInContext += s.totalTokens ?? 0;
      }
    }

    // Context window utilization across active sessions
    const contextPct = totalContextWindow > 0 ? totalUsedInContext / totalContextWindow : null;

    const fiveHourResetAt = nowSec + FIVE_HOURS_SEC;
    const weeklyResetAt = getNextSaturdayMidnightUtc(nowSec);

    await Promise.allSettled([
      upsertUsage(gatewayId, 'tokens', '5hour', fiveHourTokens, null, fiveHourResetAt, nowSec),
      upsertUsage(gatewayId, 'requests', '5hour', fiveHourSessions, null, fiveHourResetAt, nowSec),
      upsertUsage(gatewayId, 'tokens', 'weekly', weeklyTokens, null, weeklyResetAt, nowSec),
      upsertUsage(gatewayId, 'requests', 'weekly', weeklySessions, null, weeklyResetAt, nowSec),
    ]);

    console.log('[usage-collector] OpenClaw (live): %d sessions / %dk tokens (5h), %d sessions / %dk tokens (week), ctx %s%%',
      fiveHourSessions, Math.round(fiveHourTokens / 1000),
      weeklySessions, Math.round(weeklyTokens / 1000),
      contextPct != null ? Math.round(contextPct * 100) : 'n/a');
  } catch (err) {
    // Fallback to sessions.json if openclaw command fails
    try {
      if (!fs.existsSync(OPENCLAW_SESSIONS_PATH)) return;
      const raw = fs.readFileSync(OPENCLAW_SESSIONS_PATH, 'utf-8');
      const sessions: Record<string, { updatedAt?: number; totalTokens?: number }> = JSON.parse(raw);
      const nowMs = Date.now();
      let fiveHourTokens = 0, weeklyTokens = 0, fiveH = 0, weekR = 0;
      for (const s of Object.values(sessions)) {
        const age = nowMs - (s.updatedAt ?? 0);
        if (age < SEVEN_DAYS_SEC * 1000) { weeklyTokens += s.totalTokens ?? 0; weekR++; }
        if (age < FIVE_HOURS_SEC * 1000) { fiveHourTokens += s.totalTokens ?? 0; fiveH++; }
      }
      await Promise.allSettled([
        upsertUsage(gatewayId, 'tokens', '5hour', fiveHourTokens, null, nowSec + FIVE_HOURS_SEC, nowSec),
        upsertUsage(gatewayId, 'requests', '5hour', fiveH, null, nowSec + FIVE_HOURS_SEC, nowSec),
        upsertUsage(gatewayId, 'tokens', 'weekly', weeklyTokens, null, getNextSaturdayMidnightUtc(nowSec), nowSec),
        upsertUsage(gatewayId, 'requests', 'weekly', weekR, null, getNextSaturdayMidnightUtc(nowSec), nowSec),
      ]);
    } catch { /* both methods failed, skip silently */ }
  }
}

// ── DB upsert helper ────────────────────────────────────────────────────────

async function upsertUsage(
  gatewayId: string,
  limitType: string,
  period: string,
  currentValue: number,
  limitValue: number | null,
  resetAt: number | null,
  now: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO gateway_rate_limits
       (id, gateway_id, model_name, limit_type, period, limit_value, current_value, reset_at, source, updated_at)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, 'collected', $8)
     ON CONFLICT (gateway_id, COALESCE(model_name, ''), limit_type, period) DO UPDATE SET
       current_value = EXCLUDED.current_value,
       reset_at = COALESCE(EXCLUDED.reset_at, gateway_rate_limits.reset_at),
       limit_value = COALESCE(EXCLUDED.limit_value, gateway_rate_limits.limit_value),
       source = CASE
         WHEN gateway_rate_limits.source IN ('provider', 'configured') THEN gateway_rate_limits.source
         ELSE EXCLUDED.source
       END,
       updated_at = EXCLUDED.updated_at`,
    [uuidv4(), gatewayId, limitType, period, limitValue, currentValue, resetAt, now],
  );
}

// ── Time helpers ────────────────────────────────────────────────────────────

function getNextSaturdayMidnightUtc(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 6=Sat
  const daysUntilSat = dayOfWeek === 6 ? 7 : (6 - dayOfWeek);
  const nextSat = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilSat,
    0, 0, 0, 0,
  ));
  return nextSat.getTime() / 1000;
}

function getNextMidnightUtc(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const tomorrow = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return tomorrow.getTime() / 1000;
}
