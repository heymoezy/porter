import { config } from '../config.js';
import { pool } from '../db/client.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContactAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement_score: number;
  churn_risk: 'low' | 'medium' | 'high';
  key_topics: string[];
  last_interaction_summary: string;
  communication_style: string;
  relationship_stage: 'new' | 'active' | 'at-risk' | 'churned';
}

// ── Default analysis returned when no interaction history exists ──────────────

const DEFAULT_ANALYSIS: ContactAnalysis = {
  sentiment: 'neutral',
  engagement_score: 0,
  churn_risk: 'high',
  key_topics: [],
  last_interaction_summary: 'No interaction history',
  communication_style: 'unknown',
  relationship_stage: 'new',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a human-readable message history string suitable for inclusion in the
 * analysis prompt.  Each message is truncated to 200 chars to keep the prompt
 * within Qwen's context window.
 */
function buildMessagesSummary(messages: Array<{
  content: string;
  sender_type: string;
  sender_name: string | null;
  created_at: number;
}>): string {
  return messages.map(m => {
    const dateStr = new Date(m.created_at * 1000).toISOString().slice(0, 10);
    const sender = m.sender_name || m.sender_type;
    const truncated = m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content;
    return `[${dateStr} ${sender}] ${truncated}`;
  }).join('\n');
}

/** Clamp a number to the 0-100 integer range. */
function clampScore(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Coerce Ollama output to a validated ContactAnalysis.  Any missing or
 *  invalid fields fall back to safe defaults rather than throwing. */
function parseAnalysis(raw: unknown): ContactAnalysis {
  const r = raw as Record<string, unknown>;

  const VALID_SENTIMENTS = new Set(['positive', 'neutral', 'negative']);
  const VALID_CHURN_RISKS = new Set(['low', 'medium', 'high']);
  const VALID_STAGES = new Set(['new', 'active', 'at-risk', 'churned']);

  const sentiment = VALID_SENTIMENTS.has(r.sentiment as string)
    ? (r.sentiment as ContactAnalysis['sentiment'])
    : 'neutral';

  const engagement_score = clampScore(r.engagement_score);

  const churn_risk = VALID_CHURN_RISKS.has(r.churn_risk as string)
    ? (r.churn_risk as ContactAnalysis['churn_risk'])
    : 'medium';

  const key_topics = Array.isArray(r.key_topics)
    ? (r.key_topics as unknown[]).filter(t => typeof t === 'string') as string[]
    : [];

  const last_interaction_summary = typeof r.last_interaction_summary === 'string'
    ? r.last_interaction_summary
    : 'No summary available';

  const communication_style = typeof r.communication_style === 'string'
    ? r.communication_style
    : 'unknown';

  const relationship_stage = VALID_STAGES.has(r.relationship_stage as string)
    ? (r.relationship_stage as ContactAnalysis['relationship_stage'])
    : 'new';

  return { sentiment, engagement_score, churn_risk, key_topics, last_interaction_summary, communication_style, relationship_stage };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse a contact's interaction history using Ollama/Qwen.
 *
 * The function always queries fresh message history from the DB (never cached)
 * and calls Ollama directly via /api/generate (not through the AI router) with
 * format='json' to get structured output.
 *
 * Returns DEFAULT_ANALYSIS for contacts with no message history.
 * Throws on Ollama network/parse errors so the scheduler can mark the job failed
 * and re-enqueue with an error backoff.
 */
export async function analyzeContact(contactId: string): Promise<ContactAnalysis> {
  // 1. Fetch contact display name for the prompt
  const contact = (await pool.query(
    'SELECT display_name, first_name, last_name FROM contacts WHERE id = $1',
    [contactId]
  )).rows[0] as { display_name: string; first_name: string | null; last_name: string | null } | undefined;

  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  const displayName = contact.display_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    'Unknown';

  // 2. Query interaction history FRESH from the DB (locked decision: never cached)
  const messages = (await pool.query(`
    SELECT m.content, m.sender_type, m.sender_name, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN contact_conversations cc ON cc.conversation_id = c.id
    WHERE cc.contact_id = $1
    ORDER BY m.created_at DESC
    LIMIT 20
  `, [contactId])).rows as Array<{
    content: string;
    sender_type: string;
    sender_name: string | null;
    created_at: number;
  }>;

  // 3. Return default analysis when no messages exist
  if (messages.length === 0) {
    return { ...DEFAULT_ANALYSIS };
  }

  const messagesSummary = buildMessagesSummary(messages);

  // 4. Build analysis prompt
  const analysisPrompt = `You are a CRM analysis engine. Analyze the following contact interaction history and return ONLY valid JSON.

Contact: ${displayName}
Interaction history:
${messagesSummary}

Return this exact JSON structure:
{
  "sentiment": "positive|neutral|negative",
  "engagement_score": <integer 0-100>,
  "churn_risk": "low|medium|high",
  "key_topics": ["topic1", "topic2"],
  "last_interaction_summary": "<one sentence>",
  "communication_style": "<one sentence>",
  "relationship_stage": "new|active|at-risk|churned"
}

Rules:
- Return ONLY the JSON object, no other text
- engagement_score must be an integer 0-100
- key_topics must be an array of strings`;

  // 5. Call Ollama directly — never through the AI router
  const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt: analysisPrompt,
      stream: false,
      format: 'json',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    throw new Error(`Ollama returned HTTP ${resp.status}`);
  }

  // 6. Parse response
  const data = await resp.json() as { response: string };
  if (!data.response) {
    throw new Error('Ollama returned empty response field');
  }

  // 7. Strip markdown code fences before JSON.parse (Qwen sometimes wraps output)
  let cleaned = data.response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
  }

  // 8. Parse and validate shape
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse Ollama JSON response: ${(e as Error).message}. Raw: ${cleaned.slice(0, 200)}`);
  }

  return parseAnalysis(parsed);
}
