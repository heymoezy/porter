/**
 * Usage Collector — reads actual usage from provider APIs and local CLI storage
 *
 * Populates gateway_rate_limits with real usage data from:
 *   1. Claude — Anthropic OAuth usage API (provider-level, highest trust)
 *              Fallback: JSONL session files in ~/.claude/projects/
 *   2. Codex CLI — SQLite state_5.sqlite threads table
 *   3. Gemini CLI — dispatch_log counts (no local usage files)
 *
 * Called every 30 seconds by the scheduler alongside health probes.
 * Claude API is rate-limited to once per 5 minutes (429 = 1 hour backoff).
 * Uses file mtime to skip unchanged files (fast path for JSONL fallback).
 */

import { pool } from '../../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';

// ── Constants ────────────────────────────────────────────────────────────────

const HOME = process.env.HOME || '/home/lobster';
const CLAUDE_PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const CLAUDE_CREDENTIALS_PATH = path.join(HOME, '.claude', '.credentials.json');
const CODEX_SQLITE_PATH = path.join(HOME, '.codex', 'state_5.sqlite');

const CLAUDE_USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_API_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — NEVER call faster

const FIVE_HOURS_SEC = 5 * 3600;
const SEVEN_DAYS_SEC = 7 * 24 * 3600;
const ONE_DAY_SEC = 24 * 3600;

// ── Claude API usage cache ──────────────────────────────────────────────────

interface ClaudeApiCache {
  lastCallMs: number;
  retryAfterMs: number; // If 429'd, don't call until Date.now() >= this
  hasLoggedRawResponse: boolean;
}

const claudeApiCache: ClaudeApiCache = {
  lastCallMs: 0,
  retryAfterMs: 0,
  hasLoggedRawResponse: false,
};

// ── Mtime cache — skip files we've already scanned ──────────────────────────

interface ClaudeFileCache {
  mtime: number;
  messages: { timestamp: number; inputTokens: number; outputTokens: number }[];
}

const claudeFileCache = new Map<string, ClaudeFileCache>();

// ── Gateway ID cache ────────────────────────────────────────────────────────

let gatewayIds: { claude: string; codex: string; gemini: string } | null = null;

async function getGatewayIds(): Promise<typeof gatewayIds> {
  if (gatewayIds) return gatewayIds;

  const { rows } = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM gateways WHERE type IN ('claude_cli', 'codex_cli', 'gemini_cli')`,
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
  };
  return gatewayIds;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function collectLocalUsage(): Promise<void> {
  try {
    const ids = await getGatewayIds();
    if (!ids) return; // Gateways not configured yet

    await Promise.allSettled([
      collectClaudeUsage(ids.claude),
      collectCodexUsage(ids.codex),
      collectGeminiUsage(ids.gemini),
    ]);
  } catch (err) {
    console.error('[usage-collector] error:', err instanceof Error ? err.message : err);
  }
}

// ── Claude Usage API (provider-level, highest trust) ────────────────────────

/**
 * Calls the Anthropic OAuth usage API to get real usage percentages.
 * Returns true if successful (data upserted), false if failed (caller should fallback).
 *
 * Rate limit rules:
 *  - Never call more than once per 5 minutes
 *  - If 429, respect Retry-After header (typically 3600s)
 */
async function collectClaudeUsageFromAPI(gatewayId: string): Promise<boolean> {
  const now = Date.now();

  // Enforce minimum interval
  if (now < claudeApiCache.lastCallMs + CLAUDE_API_MIN_INTERVAL_MS) {
    return false; // Too soon — let fallback handle it (cached DB data is still fresh)
  }

  // Respect 429 Retry-After
  if (now < claudeApiCache.retryAfterMs) {
    return false;
  }

  // Read OAuth token
  let accessToken: string;
  try {
    const creds = JSON.parse(fs.readFileSync(CLAUDE_CREDENTIALS_PATH, 'utf-8'));
    accessToken = creds?.claudeAiOauth?.accessToken;
    if (!accessToken) {
      console.warn('[usage-collector] No Claude OAuth access token found in credentials');
      return false;
    }
  } catch {
    return false; // Credentials file missing or unreadable
  }

  claudeApiCache.lastCallMs = now;

  try {
    const resp = await fetch(CLAUDE_USAGE_API_URL, {
      method: 'GET',
      headers: {
        'x-api-key': accessToken,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('retry-after') || '3600', 10);
      claudeApiCache.retryAfterMs = now + retryAfter * 1000;
      console.warn(`[usage-collector] Claude usage API 429 — retrying after ${retryAfter}s`);
      return false;
    }

    if (!resp.ok) {
      console.warn(`[usage-collector] Claude usage API ${resp.status}: ${resp.statusText}`);
      return false;
    }

    const data: unknown = await resp.json();

    // Log raw response once so we can see the actual shape
    if (!claudeApiCache.hasLoggedRawResponse) {
      console.log('[usage-collector] Claude usage API raw response:', JSON.stringify(data));
      claudeApiCache.hasLoggedRawResponse = true;
    }

    // Parse defensively — we don't know the exact shape
    const limits = parseClaudeApiResponse(data);
    if (limits.length === 0) {
      console.warn('[usage-collector] Claude usage API returned data but no parseable limits');
      return false;
    }

    const nowSec = now / 1000;
    const upserts: Promise<void>[] = [];

    for (const lim of limits) {
      // Compute limit_value from percentage if we have it
      let limitValue: number | null = null;
      if (lim.usedPct !== null && lim.usedPct > 0 && lim.currentValue !== null) {
        limitValue = Math.round(lim.currentValue / (lim.usedPct / 100));
      } else if (lim.usedPct !== null && lim.limitValue !== null) {
        limitValue = lim.limitValue;
      }

      upserts.push(upsertUsageProvider(
        gatewayId,
        lim.limitType,
        lim.period,
        lim.currentValue ?? (lim.usedPct !== null ? lim.usedPct : 0),
        limitValue ?? (lim.usedPct !== null ? 100 : null), // If only pct, use 100 as limit (percentage scale)
        lim.resetAt,
        nowSec,
      ));
    }

    await Promise.allSettled(upserts);
    return true;
  } catch (err) {
    console.warn('[usage-collector] Claude usage API error:', err instanceof Error ? err.message : err);
    return false;
  }
}

interface ParsedLimit {
  limitType: string;   // 'usage_pct'
  period: string;      // 'session' | 'weekly' | 'weekly_sonnet'
  usedPct: number | null;
  currentValue: number | null;
  limitValue: number | null;
  resetAt: number | null;
}

/**
 * Defensively parse the Claude usage API response.
 * Handles multiple possible shapes since we haven't seen the real response yet.
 */
function parseClaudeApiResponse(data: unknown): ParsedLimit[] {
  if (!data || typeof data !== 'object') return [];
  const results: ParsedLimit[] = [];
  const obj = data as Record<string, unknown>;

  // ── Shape 1: { session: { used_pct, resets_at }, weekly: { ... }, weekly_sonnet: { ... } }
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sub = val as Record<string, unknown>;
      const pct = extractPct(sub);
      const resetAt = extractResetAt(sub);
      if (pct !== null) {
        results.push({
          limitType: 'usage_pct',
          period: normalizePeriod(key),
          usedPct: pct,
          currentValue: null,
          limitValue: null,
          resetAt,
        });
      }
    }
  }
  if (results.length > 0) return results;

  // ── Shape 2: { limits: [{ type, percentage_used, ... }] }
  const limitsArr = obj.limits ?? obj.rate_limits ?? obj.usage_limits;
  if (Array.isArray(limitsArr)) {
    for (const item of limitsArr) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const pct = extractPct(entry);
      const periodKey = (entry.type ?? entry.period ?? entry.name ?? 'unknown') as string;
      const resetAt = extractResetAt(entry);
      if (pct !== null) {
        results.push({
          limitType: 'usage_pct',
          period: normalizePeriod(String(periodKey)),
          usedPct: pct,
          currentValue: null,
          limitValue: null,
          resetAt,
        });
      }
    }
    if (results.length > 0) return results;
  }

  // ── Shape 3: { usage: { current_session: { percent }, ... } }
  const usageObj = obj.usage;
  if (usageObj && typeof usageObj === 'object' && !Array.isArray(usageObj)) {
    for (const [key, val] of Object.entries(usageObj as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const sub = val as Record<string, unknown>;
        const pct = extractPct(sub);
        const resetAt = extractResetAt(sub);
        if (pct !== null) {
          results.push({
            limitType: 'usage_pct',
            period: normalizePeriod(key),
            usedPct: pct,
            currentValue: null,
            limitValue: null,
            resetAt,
          });
        }
      }
    }
  }

  return results;
}

/** Extract a percentage value from an object, trying common key names */
function extractPct(obj: Record<string, unknown>): number | null {
  for (const key of ['used_pct', 'percentage_used', 'percent', 'pct', 'usage_percent', 'percentUsed', 'usage_pct']) {
    const val = obj[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = parseFloat(val);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/** Extract a reset timestamp from an object, trying common key names */
function extractResetAt(obj: Record<string, unknown>): number | null {
  for (const key of ['resets_at', 'reset_at', 'resetsAt', 'resetAt', 'expires_at', 'expiresAt', 'reset_time']) {
    const val = obj[key];
    if (typeof val === 'number') {
      // Could be seconds or milliseconds — normalize to seconds
      return val > 1e12 ? val / 1000 : val;
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.getTime() / 1000;
    }
  }
  return null;
}

/** Normalize period strings to our DB convention */
function normalizePeriod(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (lower.includes('session') || lower.includes('5hour') || lower.includes('5_hour')) return 'session';
  if (lower.includes('sonnet')) return 'weekly_sonnet';
  if (lower.includes('week') || lower.includes('7day') || lower.includes('7_day')) return 'weekly';
  if (lower.includes('daily') || lower.includes('day')) return 'daily';
  if (lower.includes('month')) return 'monthly';
  return lower;
}

/**
 * Upsert with source='provider' — highest trust, always overwrites.
 * Separate from the collected upsert to ensure provider data wins.
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

// ── Claude Code CLI (JSONL fallback) ────────────────────────────────────────

async function collectClaudeUsage(gatewayId: string): Promise<void> {
  // Try the provider API first (highest trust data)
  await collectClaudeUsageFromAPI(gatewayId);

  // Always run JSONL scan for token/request counts (the API gives percentages, JSONL gives absolutes)
  // Provider-source percentage data won't be overwritten by collected-source (lower trust)
  await collectClaudeUsageFromJSONL(gatewayId);
}

async function collectClaudeUsageFromJSONL(gatewayId: string): Promise<void> {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return;

  const nowSec = Date.now() / 1000;
  const fiveHourCutoff = nowSec - FIVE_HOURS_SEC;
  const weekCutoff = nowSec - SEVEN_DAYS_SEC;

  // Scan all project dirs for JSONL files
  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(CLAUDE_PROJECTS_DIR, d.name));
  } catch {
    return;
  }

  // Gather all JSONL files with mtimes
  const jsonlFiles: { path: string; mtime: number }[] = [];
  for (const dir of projectDirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.name.endsWith('.jsonl')) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          const mtimeSec = stat.mtimeMs / 1000;
          // Skip files not modified in the last 7 days (irrelevant to both windows)
          if (mtimeSec < weekCutoff) continue;
          jsonlFiles.push({ path: fullPath, mtime: mtimeSec });
        } catch {
          // File disappeared between readdir and stat — skip
        }
      }
    } catch {
      // Project dir inaccessible — skip
    }
  }

  // Parse files that have changed since last scan (or are new)
  for (const file of jsonlFiles) {
    const cached = claudeFileCache.get(file.path);
    if (cached && cached.mtime >= file.mtime) continue; // Unchanged — skip

    const messages = parseClaudeJsonl(file.path);
    claudeFileCache.set(file.path, { mtime: file.mtime, messages });
  }

  // Prune stale cache entries (files deleted or older than 7 days)
  const activePaths = new Set(jsonlFiles.map(f => f.path));
  for (const key of claudeFileCache.keys()) {
    if (!activePaths.has(key)) claudeFileCache.delete(key);
  }

  // Aggregate across all cached files
  let fiveHourMessages = 0;
  let fiveHourTokens = 0;
  let weeklyMessages = 0;
  let weeklyTokens = 0;
  let oldestInFiveHour: number | null = null;
  let oldestInWeek: number | null = null;

  for (const cached of claudeFileCache.values()) {
    for (const msg of cached.messages) {
      if (msg.timestamp >= fiveHourCutoff) {
        fiveHourMessages++;
        fiveHourTokens += msg.inputTokens + msg.outputTokens;
        if (oldestInFiveHour === null || msg.timestamp < oldestInFiveHour) {
          oldestInFiveHour = msg.timestamp;
        }
      }
      if (msg.timestamp >= weekCutoff) {
        weeklyMessages++;
        weeklyTokens += msg.inputTokens + msg.outputTokens;
        if (oldestInWeek === null || msg.timestamp < oldestInWeek) {
          oldestInWeek = msg.timestamp;
        }
      }
    }
  }

  // Compute reset_at
  const fiveHourResetAt = oldestInFiveHour !== null
    ? oldestInFiveHour + FIVE_HOURS_SEC
    : null;

  // Weekly: next Saturday midnight UTC
  const weeklyResetAt = getNextSaturdayMidnightUtc(nowSec);

  // Upsert into DB
  await Promise.allSettled([
    upsertUsage(gatewayId, 'requests', '5hour', fiveHourMessages, null, fiveHourResetAt, nowSec),
    upsertUsage(gatewayId, 'tokens', '5hour', fiveHourTokens, null, fiveHourResetAt, nowSec),
    upsertUsage(gatewayId, 'requests', 'weekly', weeklyMessages, null, weeklyResetAt, nowSec),
    upsertUsage(gatewayId, 'tokens', 'weekly', weeklyTokens, null, weeklyResetAt, nowSec),
  ]);
}

function parseClaudeJsonl(filePath: string): ClaudeFileCache['messages'] {
  const messages: ClaudeFileCache['messages'] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'assistant') continue;
        const msg = obj.message;
        if (!msg || typeof msg !== 'object' || !msg.usage) continue;

        const usage = msg.usage;
        const inputTokens = (usage.input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0)
          + (usage.cache_read_input_tokens || 0);
        const outputTokens = usage.output_tokens || 0;

        // Parse timestamp from the parent object (ISO 8601)
        let timestamp = 0;
        if (obj.timestamp) {
          const d = new Date(obj.timestamp);
          if (!isNaN(d.getTime())) timestamp = d.getTime() / 1000;
        }

        messages.push({ timestamp, inputTokens, outputTokens });
      } catch {
        // Malformed line — skip
      }
    }
  } catch {
    // File read error — return empty
  }
  return messages;
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
