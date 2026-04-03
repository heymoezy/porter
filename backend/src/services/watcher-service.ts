/**
 * watcher-service.ts -- Project Monitoring: Phase 46
 *
 * Watcher execution engine with 4 type handlers:
 *   - web_search: Brave Search API (or graceful fallback)
 *   - rss_feed: RSS/Atom feed parser
 *   - email_monitor: keyword search across email_messages table
 *   - custom: LLM-driven freeform monitoring via Ollama
 *
 * Watchers produce WatcherFinding[] rows stored in watcher_findings.
 */

import { pool } from '../db/client.js';
import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WatcherConfig {
  id: string;
  project_id: string;
  name: string;
  watcher_type: 'web_search' | 'rss_feed' | 'email_monitor' | 'custom';
  schedule_interval_sec: number;
  config: Record<string, unknown>;
  notify_email: string | null;
}

export interface WatcherFinding {
  title: string;
  summary: string;
  detail: Record<string, unknown>;
  importance: 'normal' | 'important' | 'critical';
}

// ── Main executor ────────────────────────────────────────────────────────────

/**
 * Execute a watcher by ID, producing findings and updating state.
 * Called from scheduler when a watcher_run job fires.
 */
export async function executeWatcher(watcherId: string, jobId: string): Promise<void> {
  // Load watcher config
  const { rows } = await pool.query(
    `SELECT id, project_id, name, watcher_type, schedule_interval_sec, config, notify_email, status
     FROM project_watchers WHERE id = $1`,
    [watcherId],
  );
  const row = rows[0] as (WatcherConfig & { status: string }) | undefined;
  if (!row || row.status !== 'active') return;

  const watcher: WatcherConfig = {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    watcher_type: row.watcher_type,
    schedule_interval_sec: row.schedule_interval_sec,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config ?? {}),
    notify_email: row.notify_email,
  };

  let findings: WatcherFinding[];
  try {
    // Dispatch to type handler
    switch (watcher.watcher_type) {
      case 'web_search':
        findings = await executeWebSearch(watcher.config);
        break;
      case 'rss_feed':
        findings = await executeRssFeed(watcher.config);
        break;
      case 'email_monitor':
        findings = await executeEmailMonitor(watcher.config);
        break;
      case 'custom':
        findings = await executeCustom(watcher.config);
        break;
      default:
        findings = [];
    }

    // Insert findings
    for (const f of findings) {
      await pool.query(
        `INSERT INTO watcher_findings (id, watcher_id, project_id, source_type, title, summary, detail, importance, job_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, EXTRACT(EPOCH FROM NOW()))`,
        [
          crypto.randomUUID(),
          watcher.id,
          watcher.project_id,
          watcher.watcher_type,
          f.title.slice(0, 500),
          f.summary.slice(0, 2000),
          JSON.stringify(f.detail),
          f.importance,
          jobId,
        ],
      );
    }

    // Update watcher state on success
    await pool.query(
      `UPDATE project_watchers
       SET last_run_at = EXTRACT(EPOCH FROM NOW()),
           run_count = run_count + 1,
           finding_count = finding_count + $1,
           next_run_at = EXTRACT(EPOCH FROM NOW()) + schedule_interval_sec,
           last_error = NULL,
           updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE id = $2`,
      [findings.length, watcher.id],
    );

    console.log('[watcher] %s (%s) produced %d findings', watcher.name, watcher.watcher_type, findings.length);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check attempt count to decide if we should mark error status
    const attemptResult = await pool.query(
      `SELECT run_count FROM project_watchers WHERE id = $1`,
      [watcher.id],
    );
    const runCount = attemptResult.rows[0]?.run_count ?? 0;
    const newStatus = runCount > 3 ? 'error' : 'active';

    await pool.query(
      `UPDATE project_watchers
       SET last_error = $1,
           status = $2,
           last_run_at = EXTRACT(EPOCH FROM NOW()),
           run_count = run_count + 1,
           next_run_at = EXTRACT(EPOCH FROM NOW()) + schedule_interval_sec,
           updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE id = $3`,
      [msg.slice(0, 2000), newStatus, watcher.id],
    );
    console.error('[watcher] %s (%s) failed: %s', watcher.name, watcher.watcher_type, msg.slice(0, 200));
    throw err; // re-throw so scheduler marks the job as failed
  }
}

// ── Type handlers ────────────────────────────────────────────────────────────

/**
 * Web search watcher: uses Brave Search API if BRAVE_API_KEY is set.
 */
async function executeWebSearch(config: Record<string, unknown>): Promise<WatcherFinding[]> {
  const query = String(config.query ?? '');
  const maxResults = Number(config.max_results) || 5;
  if (!query) return [];

  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return [{
      title: 'Web search unavailable',
      summary: 'Configure BRAVE_API_KEY to enable web search watchers',
      detail: {},
      importance: 'normal',
    }];
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!resp.ok) {
    throw new Error(`Brave Search API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as {
    web?: { results?: Array<{ title: string; description: string; url: string; age?: string }> };
  };

  const results = data.web?.results ?? [];
  return results.slice(0, maxResults).map((r) => ({
    title: r.title ?? 'Untitled',
    summary: (r.description ?? '').slice(0, 300),
    detail: { url: r.url, published_date: r.age ?? null, source: 'brave_search' },
    importance: 'normal' as const,
  }));
}

/**
 * RSS/Atom feed watcher: fetches and parses feed XML.
 */
async function executeRssFeed(config: Record<string, unknown>): Promise<WatcherFinding[]> {
  const feedUrl = String(config.feed_url ?? '');
  const maxItems = Number(config.max_items) || 10;
  const sinceHours = Number(config.since_hours) || 24;
  if (!feedUrl) return [];

  const resp = await fetch(feedUrl, {
    headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  });
  if (!resp.ok) {
    throw new Error(`RSS fetch error: ${resp.status} ${resp.statusText} for ${feedUrl}`);
  }

  const xml = await resp.text();
  const cutoff = Date.now() - sinceHours * 3600 * 1000;

  // Parse RSS <item> elements
  const findings: WatcherFinding[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;

  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) blocks.push(match[1]);
  while ((match = entryRegex.exec(xml)) !== null) blocks.push(match[1]);

  for (const block of blocks) {
    if (findings.length >= maxItems) break;

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractAttr(block, 'link', 'href');
    const description = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');

    // Filter by recency if pubDate is parseable
    if (pubDate) {
      const parsed = Date.parse(pubDate);
      if (!isNaN(parsed) && parsed < cutoff) continue;
    }

    findings.push({
      title: title || 'Untitled',
      summary: stripHtml(description ?? '').slice(0, 300),
      detail: { url: link, published: pubDate, raw_description: (description ?? '').slice(0, 1000) },
      importance: 'normal',
    });
  }

  return findings;
}

/**
 * Email monitor watcher: searches email_messages table by keyword.
 */
async function executeEmailMonitor(config: Record<string, unknown>): Promise<WatcherFinding[]> {
  const filter = String(config.filter ?? '');
  const hoursBack = Number(config.hours_back) || 24;
  if (!filter) return [];

  const cutoff = Date.now() / 1000 - hoursBack * 3600;
  const likeFilter = `%${filter}%`;

  const { rows } = await pool.query(
    `SELECT subject, body_text, sender, recipient, message_id, created_at
     FROM email_messages
     WHERE created_at > $1
       AND (subject ILIKE $2 OR body_text ILIKE $2)
     ORDER BY created_at DESC
     LIMIT 20`,
    [cutoff, likeFilter],
  );

  return (rows as Array<{
    subject: string;
    body_text: string;
    sender: string;
    recipient: string;
    message_id: string;
  }>).map((r) => ({
    title: r.subject || 'No subject',
    summary: (r.body_text ?? '').slice(0, 200),
    detail: { from: r.sender, to: r.recipient, message_id: r.message_id },
    importance: 'normal' as const,
  }));
}

/**
 * Custom watcher: LLM-driven monitoring via Ollama local model.
 */
async function executeCustom(config: Record<string, unknown>): Promise<WatcherFinding[]> {
  const prompt = String(config.prompt ?? '');
  const dataSource = config.data_source ? String(config.data_source) : null;
  if (!prompt) return [];

  let context = '';
  if (dataSource) {
    try {
      const resp = await fetch(dataSource);
      if (resp.ok) {
        context = (await resp.text()).slice(0, 4000);
      }
    } catch {
      // Data source fetch failed — proceed with prompt only
    }
  }

  const fullPrompt = context
    ? `Context data:\n${context}\n\n---\n\nTask: ${prompt}\n\nRespond with a JSON array of findings. Each finding: {"title":"...","summary":"...","importance":"normal|important|critical"}`
    : `Task: ${prompt}\n\nRespond with a JSON array of findings. Each finding: {"title":"...","summary":"...","importance":"normal|important|critical"}`;

  try {
    const resp = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5-coder:1.5b',
        prompt: fullPrompt,
        stream: false,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Ollama error: ${resp.status}`);
    }

    const data = await resp.json() as { response?: string };
    const raw = data.response ?? '';

    // Try to parse as JSON array
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ title?: string; summary?: string; importance?: string }>;
        return parsed.map((item) => ({
          title: String(item.title ?? 'Finding'),
          summary: String(item.summary ?? ''),
          detail: {},
          importance: (['normal', 'important', 'critical'].includes(item.importance ?? '')
            ? item.importance as 'normal' | 'important' | 'critical'
            : 'normal'),
        }));
      }
    } catch {
      // Not valid JSON — wrap as single finding
    }

    // Fallback: wrap raw response as single finding
    return [{
      title: 'Custom watcher result',
      summary: raw.slice(0, 300),
      detail: { raw_response: raw.slice(0, 2000) },
      importance: 'normal',
    }];
  } catch (err) {
    // Ollama not available — return graceful fallback
    return [{
      title: 'Custom watcher unavailable',
      summary: `Ollama not reachable: ${err instanceof Error ? err.message : String(err)}`,
      detail: {},
      importance: 'normal',
    }];
  }
}

// ── Watcher scheduling ───────────────────────────────────────────────────────

/**
 * Check for due watchers and enqueue watcher_run jobs.
 * Called from scheduler tick every 60s.
 */
export async function scheduleWatcherRuns(): Promise<void> {
  const now = Date.now() / 1000;
  const { rows: dueWatchers } = await pool.query(
    `SELECT id, project_id, schedule_interval_sec
     FROM project_watchers
     WHERE status = 'active'
       AND (next_run_at IS NULL OR next_run_at <= $1)`,
    [now],
  );

  for (const w of dueWatchers as Array<{ id: string; project_id: string; schedule_interval_sec: number }>) {
    // Dedup guard: skip if pending/running watcher_run job exists for this watcher_id
    const existing = await pool.query(
      `SELECT 1 FROM agent_jobs
       WHERE trigger_type = 'watcher_run'
         AND status IN ('pending', 'running')
         AND trigger_data @> $1::jsonb
       LIMIT 1`,
      [JSON.stringify({ watcher_id: w.id })],
    );
    if (existing.rows.length > 0) continue;

    // Enqueue watcher_run job
    const jobId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, source, status, scheduled_for, created_at)
       VALUES ($1, 'system', $2, 'watcher_run', $3, 'watcher', 'pending', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [jobId, w.project_id, JSON.stringify({ watcher_id: w.id })],
    );

    // Update next_run_at on the watcher
    await pool.query(
      `UPDATE project_watchers SET next_run_at = EXTRACT(EPOCH FROM NOW()) + schedule_interval_sec WHERE id = $1`,
      [w.id],
    );

    console.log('[watcher] scheduled watcher_run for %s (job %s)', w.id.slice(0, 8), jobId.slice(0, 8));
  }
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
