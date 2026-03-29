/**
 * Agent Intelligence Loop — research before acting
 *
 * Every agent action goes through:
 *   1. Research (gather context, assess impact)
 *   2. Report (post to intelligence_feed)
 *   3. Decide (auto-act if low risk, wait for review if high)
 *   4. Act (execute if approved)
 *   5. Log (post result back)
 *
 * This is Porter's defining behavior — predictable, transparent, auditable AI.
 */

import { execute } from '../db/pg.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type EntryType = 'capability' | 'blocker' | 'idea' | 'gap' | 'learning';

interface IntelligencePost {
  sourceAgent: string;
  entryType: EntryType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Post an entry to the intelligence feed.
 * Used by agents to report findings before/after actions.
 */
export async function postIntelligence(entry: IntelligencePost): Promise<string> {
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();

  await execute(
    `INSERT INTO intelligence_feed (id, source_agent, entry_type, title, body, metadata, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'new', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
    [id, entry.sourceAgent, entry.entryType, entry.title, entry.body, JSON.stringify(entry.metadata || {})]
  );

  return id;
}

/**
 * Post multiple entries at once (batch).
 */
export async function postIntelligenceBatch(entries: IntelligencePost[]): Promise<string[]> {
  const ids: string[] = [];
  for (const entry of entries) {
    ids.push(await postIntelligence(entry));
  }
  return ids;
}

/**
 * Determine if an action should auto-execute based on risk level.
 */
export function shouldAutoAct(risk: RiskLevel): boolean {
  return risk === 'low' || risk === 'medium';
}

/**
 * Assess risk of a gateway update based on version delta.
 */
export function assessUpdateRisk(currentVersion: string | null, targetVersion: string | null): RiskLevel {
  if (!currentVersion || !targetVersion) return 'medium';

  const current = currentVersion.split('.').map(Number);
  const target = targetVersion.split('.').map(Number);

  // Major version change = high risk
  if (target[0] !== current[0]) return 'high';

  // Minor version change = medium risk
  if (target[1] !== current[1]) return 'medium';

  // Patch only = low risk
  return 'low';
}
