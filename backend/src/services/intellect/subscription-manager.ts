/**
 * Intellect Subscription Manager
 *
 * Agents subscribe to external information sources. The subscription manager
 * periodically fetches new content and turns it into agent_notes or concepts
 * so Porter's knowledge stays current.
 *
 * Source types:
 *   - rss: RSS/Atom feed URL → parse entries → create agent_notes
 *   - release: GitHub releases API → track version changes → update tools
 *   - changelog: URL → diff since last check → extract learnings
 *
 * Design: lightweight polling, no streaming. Each subscription has a check
 * interval (default 6h). The manager runs as an Intellect workflow.
 *
 * Phase 1: RSS + release tracking for core tools (node, ollama, claude, etc.)
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { randomUUID } from 'node:crypto';

// ── Types ───────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  agent_id: string | null;
  source_type: 'rss' | 'release' | 'changelog';
  source_url: string;
  name: string;
  check_interval_seconds: number;
  last_checked_at: number | null;
  last_content_hash: string | null;
  enabled: boolean;
}

export interface SubscriptionCheckResult {
  total: number;
  checked: number;
  newItems: number;
  errors: number;
}

// ── Migration (idempotent) ──────────────────────────────────────────────

export async function ensureSubscriptionsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_subscriptions (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'rss',
      source_url TEXT NOT NULL,
      name TEXT NOT NULL,
      check_interval_seconds INTEGER NOT NULL DEFAULT 21600,
      last_checked_at DOUBLE PRECISION,
      last_content_hash TEXT,
      enabled BOOLEAN DEFAULT true,
      created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_subs_agent ON agent_subscriptions(agent_id)`);
}

// ── Seed default subscriptions ──────────────────────────────────────────

const DEFAULT_SUBSCRIPTIONS: Array<{
  id: string;
  agent_id: string | null;
  source_type: 'rss' | 'release';
  source_url: string;
  name: string;
}> = [
  {
    id: 'sub-node-releases',
    agent_id: null,
    source_type: 'release',
    source_url: 'https://api.github.com/repos/nodejs/node/releases?per_page=3',
    name: 'Node.js releases',
  },
  {
    id: 'sub-ollama-releases',
    agent_id: null,
    source_type: 'release',
    source_url: 'https://api.github.com/repos/ollama/ollama/releases?per_page=3',
    name: 'Ollama releases',
  },
  {
    id: 'sub-anthropic-news',
    agent_id: null,
    source_type: 'rss',
    source_url: 'https://www.anthropic.com/rss.xml',
    name: 'Anthropic news',
  },
  {
    id: 'sub-openai-changelog',
    agent_id: null,
    source_type: 'rss',
    source_url: 'https://platform.openai.com/docs/changelog/rss.xml',
    name: 'OpenAI API changelog',
  },
];

export async function seedDefaultSubscriptions(): Promise<void> {
  for (const sub of DEFAULT_SUBSCRIPTIONS) {
    await pool.query(
      `INSERT INTO agent_subscriptions (id, agent_id, source_type, source_url, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [sub.id, sub.agent_id, sub.source_type, sub.source_url, sub.name]
    );
  }
}

// ── Fetch helpers ───────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Porter-Intellect/1.0' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(text.length, 5000); i++) {
    const ch = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash.toString(36);
}

// ── Process individual subscription ─────────────────────────────────────

async function processSubscription(sub: Subscription): Promise<number> {
  const now = Date.now() / 1000;
  const content = await fetchWithTimeout(sub.source_url);
  if (!content) return 0;

  const hash = simpleHash(content);
  if (hash === sub.last_content_hash) {
    // No change since last check
    await pool.query(
      `UPDATE agent_subscriptions SET last_checked_at = $1 WHERE id = $2`,
      [now, sub.id]
    );
    return 0;
  }

  let newItems = 0;

  if (sub.source_type === 'release') {
    // Parse GitHub releases JSON
    try {
      const releases = JSON.parse(content) as Array<{
        tag_name: string;
        name: string;
        published_at: string;
        body: string;
      }>;
      for (const rel of releases.slice(0, 2)) {
        const noteContent = `[${sub.name}] ${rel.tag_name}: ${rel.name || 'new release'} (${rel.published_at?.split('T')[0] || 'recent'})`;
        // Create concept if it doesn't exist (dedupe by tag)
        const { rowCount } = await pool.query(
          `INSERT INTO concepts (id, memory_kind, trust_tier, scope, content, source_type, confidence_score, status, review_state, created_at, updated_at)
           SELECT $1, 'concept', 'low', 'global', $2, 'subscription', 30, 'active', 'accepted',
                  EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())
           WHERE NOT EXISTS (SELECT 1 FROM concepts WHERE content LIKE '%' || $3 || '%' AND source_type = 'subscription')`,
          [randomUUID(), noteContent, rel.tag_name]
        );
        if (rowCount && rowCount > 0) newItems++;
      }
    } catch { /* parse error — skip */ }
  } else if (sub.source_type === 'rss') {
    // Simple RSS/Atom extraction — grab <title> + <link> from first 3 <item>/<entry>
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i;
    const linkRegex = /<link[^>]*(?:href="([^"]+)"|>([^<]+)<)/i;

    let match;
    let count = 0;
    while ((match = itemRegex.exec(content)) !== null && count < 3) {
      const block = match[1];
      const title = titleRegex.exec(block)?.[1]?.trim() || 'untitled';
      const link = linkRegex.exec(block)?.[1] || linkRegex.exec(block)?.[2] || '';
      const noteContent = `[${sub.name}] ${title}${link ? ' — ' + link : ''}`;

      const { rowCount } = await pool.query(
        `INSERT INTO concepts (id, memory_kind, trust_tier, scope, content, source_type, confidence_score, status, review_state, created_at, updated_at)
         SELECT $1, 'concept', 'low', 'global', $2, 'subscription', 20, 'active', 'accepted',
                EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())
         WHERE NOT EXISTS (SELECT 1 FROM concepts WHERE content LIKE '%' || $3 || '%' AND source_type = 'subscription')`,
        [randomUUID(), noteContent, title.slice(0, 60)]
      );
      if (rowCount && rowCount > 0) newItems++;
      count++;
    }
  }

  // Update subscription state
  await pool.query(
    `UPDATE agent_subscriptions SET last_checked_at = $1, last_content_hash = $2 WHERE id = $3`,
    [now, hash, sub.id]
  );

  return newItems;
}

// ── Main run ────────────────────────────────────────────────────────────

export async function runSubscriptionCheck(): Promise<SubscriptionCheckResult> {
  await ensureSubscriptionsTable();

  const now = Date.now() / 1000;

  // Find subscriptions due for checking
  const { rows: subs } = await pool.query<Subscription>(
    `SELECT id, agent_id, source_type, source_url, name,
            check_interval_seconds, last_checked_at, last_content_hash, enabled
     FROM agent_subscriptions
     WHERE enabled = true
       AND (last_checked_at IS NULL OR last_checked_at + check_interval_seconds < $1)
     ORDER BY last_checked_at ASC NULLS FIRST
     LIMIT 10`,
    [now]
  );

  let checked = 0;
  let newItems = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      const items = await processSubscription(sub);
      newItems += items;
      checked++;
    } catch (err) {
      errors++;
      console.error(`[intellect:subscriptions] error checking ${sub.name}:`, err instanceof Error ? err.message : err);
    }
  }

  if (newItems > 0) {
    await logIntellectEvent('subscriptions_checked', 'subscription_manager', {
      checked,
      newItems,
      errors,
    });
    console.log(`[intellect:subscriptions] checked ${checked} sources, ${newItems} new items`);
  }

  return { total: subs.length, checked, newItems, errors };
}
