/**
 * Usage Collector — Claude CLI only
 *
 * Populates gateway_rate_limits with real usage data from Anthropic's API.
 * Makes a minimal Haiku probe call and reads the rate-limit utilization headers
 * to get 5-hour and 7-day usage percentages directly from the provider.
 *
 * Called every 30 seconds by the scheduler alongside health probes.
 * Claude API call is rate-limited to once per 5 minutes (~1 Haiku token = negligible cost).
 */

import { pool } from '../../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { emitSSE } from '../scheduler.js';

// ── Constants ────────────────────────────────────────────────────────────────

const HOME = process.env.HOME || '/home/lobster';
const CLAUDE_CREDENTIALS_PATH = path.join(HOME, '.claude', '.credentials.json');

const CLAUDE_MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CLAUDE_CLIENT_ID = '22422756-60c9-4084-8eb7-27705fd5cf9a';

const CLAUDE_API_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

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

// ── Activity Sniffer — detects session transitions ──────────────────────────

interface SnifferState {
  activeSessions: number;
  totalTokens: number;
  wasActive: boolean;
}

let sniffer: SnifferState | null = null;

function sniffActivity(sessions: number, tokens: number): void {
  const prev = sniffer;
  const nowActive = sessions > 0;
  const wasActive = prev?.wasActive ?? false;

  if (!wasActive && nowActive) {
    const tokStr = tokens > 0 ? ` · ${fmtTokens(tokens)} tokens` : '';
    emitSSE('bridge:activity', {
      gateway: 'Claude CLI',
      type: 'claude_cli',
      event: 'session_start',
      text: `Claude CLI active — ${sessions} session${sessions > 1 ? 's' : ''}${tokStr}`,
    }).catch(() => {});
    console.log('[sniffer] Claude CLI: idle → active (%d sessions)', sessions);
  } else if (wasActive && !nowActive) {
    const tokStr = prev?.totalTokens ? ` · ${fmtTokens(prev.totalTokens)} tokens used` : '';
    emitSSE('bridge:activity', {
      gateway: 'Claude CLI',
      type: 'claude_cli',
      event: 'session_end',
      text: `Claude CLI idle${tokStr}`,
    }).catch(() => {});
    console.log('[sniffer] Claude CLI: active → idle');
  } else if (nowActive && prev) {
    const tokenDelta = tokens - prev.totalTokens;
    if (tokenDelta > 5000) {
      emitSSE('bridge:activity', {
        gateway: 'Claude CLI',
        type: 'claude_cli',
        event: 'token_growth',
        text: `Claude CLI working — ${fmtTokens(tokens)} tokens (+${fmtTokens(tokenDelta)})`,
        sessions,
        tokens,
      }).catch(() => {});
    }
  }

  sniffer = { activeSessions: sessions, totalTokens: tokens, wasActive: nowActive };
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Gateway ID cache ────────────────────────────────────────────────────────

let claudeGatewayId: string | null = null;

async function getClaudeGatewayId(): Promise<string | null> {
  if (claudeGatewayId) return claudeGatewayId;

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM gateways WHERE type = 'claude_cli' LIMIT 1`,
  );

  if (rows.length === 0) return null;
  claudeGatewayId = rows[0].id;
  return claudeGatewayId;
}

// ── Main entry point ────────────────────────────────────────────────────────

type CollectLocalUsageOptions = {
  forceAuthRefresh?: boolean;
};

export async function collectLocalUsage(options: CollectLocalUsageOptions = {}): Promise<void> {
  try {
    const gatewayId = await getClaudeGatewayId();
    if (!gatewayId) return; // Gateway not configured yet

    await collectClaudeUsage(gatewayId, options);

    // Emit SSE so admin UI refreshes capacity in real-time
    emitSSE('bridge:usage', { ts: Date.now() }).catch(() => {});
  } catch (err) {
    console.error('[usage-collector] error:', err instanceof Error ? err.message : err);
  }
}

// ── Claude OAuth Token Refresh ────────────────────────────────────────────────

/**
 * Refresh the Claude OAuth token using the refresh_token grant.
 * Writes updated credentials back to .credentials.json so Claude Code
 * and Porter both see the fresh token.
 *
 * Returns the new access token on success, null on failure.
 */
async function refreshClaudeOAuthToken(refreshToken: string): Promise<string | null> {
  try {
    const resp = await fetch(CLAUDE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn('[usage-collector] Claude token refresh failed: HTTP %d', resp.status);
      return null;
    }

    const data = await resp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!data.access_token) {
      console.warn('[usage-collector] Claude token refresh: no access_token in response');
      return null;
    }

    // Write refreshed credentials back to disk
    const credsRaw = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, 'utf-8');
    const creds = JSON.parse(credsRaw);
    creds.claudeAiOauth.accessToken = data.access_token;
    if (data.refresh_token) creds.claudeAiOauth.refreshToken = data.refresh_token;
    creds.claudeAiOauth.expiresAt = Date.now() + data.expires_in * 1000;
    fs.writeFileSync(CLAUDE_CREDENTIALS_PATH, JSON.stringify(creds));

    console.log('[usage-collector] Claude OAuth token refreshed — expires in %ds', data.expires_in);
    return data.access_token;
  } catch (err) {
    console.warn('[usage-collector] Claude token refresh error:', err instanceof Error ? err.message : err);
    return null;
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
async function collectClaudeUsage(
  gatewayId: string,
  options: CollectLocalUsageOptions = {},
): Promise<void> {
  const now = Date.now();

  // Rate limit: max once per 5 minutes
  if (!options.forceAuthRefresh && now < claudeApiCache.lastCallMs + CLAUDE_API_MIN_INTERVAL_MS) {
    // Use cached result if available
    if (claudeApiCache.lastResult) {
      await upsertClaudeFromCache(gatewayId, claudeApiCache.lastResult, now / 1000);
    }
    return;
  }

  // Read OAuth credentials, auto-refresh if expired or expiring soon
  let accessToken: string;
  try {
    const creds = JSON.parse(fs.readFileSync(CLAUDE_CREDENTIALS_PATH, 'utf-8'));
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) {
      console.warn('[usage-collector] No Claude OAuth access token in credentials');
      return;
    }

    const shouldRefreshToken = Boolean(
      oauth.refreshToken && (
        options.forceAuthRefresh ||
        (oauth.expiresAt && typeof oauth.expiresAt === 'number' && oauth.expiresAt < now + TOKEN_REFRESH_BUFFER_MS)
      ),
    );

    if (shouldRefreshToken) {
      const refreshed = await refreshClaudeOAuthToken(oauth.refreshToken);
      if (!refreshed) return;
      accessToken = refreshed;
    } else {
      accessToken = oauth.accessToken;
    }
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

    // Sniff for utilization changes (active if >0%)
    const activeSessions = result.fiveHourUtilization > 0 ? 1 : 0;
    sniffActivity(activeSessions, Math.round(result.fiveHourUtilization * 100));

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
    upsertUsage(
      gatewayId,
      'requests',
      '5hour',
      Math.round(data.fiveHourUtilization * 10000) / 100, // e.g. 0.21 → 21.00
      100,
      data.fiveHourReset,
      nowSec,
    ),
    // 7-day weekly window
    upsertUsage(
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
