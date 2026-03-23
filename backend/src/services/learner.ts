/**
 * Autonomous Learning Engine (Phase 13)
 *
 * Implements the research loop that transforms raw web content into structured
 * expertise frameworks stored in Memory V2 concepts table.
 *
 * Exported functions:
 *   runLearningSession  — run a full research loop for a given agent template
 *
 * Exported types:
 *   LearningSessionResult — result returned from runLearningSession()
 *   SourceVisit           — per-source visit metadata
 *
 * Design decisions (locked):
 *   - Three sources: DuckDuckGo (duck-duck-scrape), GitHub (octokit), Reddit (.json endpoint)
 *   - Confidence scores via source domain authority — never LLM self-assessment
 *   - PII scrubbing: prompt instruction + post-extraction regex pass
 *   - Ollama called directly via fetch() — never through AI router
 *   - 20-request cap per session; capped=1 logged in learning_sessions
 *   - robots.txt checked and cached per domain with 24h TTL
 *   - Concepts scoped to template: scope='agent', scope_id=templateId
 */

import crypto from 'crypto';
import { search } from 'duck-duck-scrape';
import robotsParser from 'robots-parser';
import { config } from '../config.js';
import { pool } from '../db/client.js';
import { getGitHubClient } from './github.js';

// ── Exported Types ─────────────────────────────────────────────────────────────

export interface LearningSessionResult {
  session_id: string;
  template_id: string;
  sources_visited: SourceVisit[];
  concepts_retained: number;
  confidence_distribution: { high: number; medium: number; low: number };
  capped: boolean;
  duration_ms: number;
  domain_activity: number; // 0-100, drives next session cadence
}

export interface SourceVisit {
  url: string;
  source_type: 'web' | 'github' | 'reddit';
  fetched_at: number;
  http_status: number;
  robots_blocked: boolean;
}

interface ExtractedConcept {
  content: string;
  concept_type: string;
  source_url: string;
  confidence_score: number;
  trust_tier: 'low' | 'medium' | 'high';
}

interface OllamaExtractionResult {
  concepts: ExtractedConcept[];
  domainActivity: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LEARNER_USER_AGENT = 'PorterLearner/1.0 (educational research bot)';
const MAX_REQUESTS_PER_SESSION = 20;
const POLITENESS_DELAY_MS = 2000; // 2s between requests to same source type
const OLLAMA_TIMEOUT_MS = 30000;
const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Session Budget ─────────────────────────────────────────────────────────────

class SessionBudget {
  private _count: number = 0;
  private readonly _max: number;

  constructor(max: number) {
    this._max = max;
  }

  consume(n: number = 1): void {
    this._count += n;
  }

  get remaining(): number {
    return Math.max(0, this._max - this._count);
  }

  get capped(): boolean {
    return this._count >= this._max;
  }

  get count(): number {
    return this._count;
  }
}

// ── robots.txt Cache ──────────────────────────────────────────────────────────

interface RobotsEntry {
  rules: ReturnType<typeof robotsParser>;
  expiresAt: number;
}

const robotsCache = new Map<string, RobotsEntry>();

/**
 * Check whether the LEARNER_USER_AGENT is allowed to fetch the given URL.
 * Fetches and caches robots.txt per hostname (24h TTL).
 * On fetch error, assumes allowed (permissive default).
 * robots.txt fetches do NOT count against session budget.
 */
async function isAllowedByRobots(url: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true; // Malformed URL — allow
  }

  const now = Date.now();
  const cached = robotsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.rules.isAllowed(url, LEARNER_USER_AGENT) ?? true;
  }

  const robotsUrl = `https://${hostname}/robots.txt`;
  try {
    const resp = await fetch(robotsUrl, {
      headers: { 'User-Agent': LEARNER_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    const text = resp.ok ? await resp.text() : '';
    const rules = robotsParser(robotsUrl, text);
    robotsCache.set(hostname, { rules, expiresAt: now + ROBOTS_CACHE_TTL_MS });
    return rules.isAllowed(url, LEARNER_USER_AGENT) ?? true;
  } catch {
    // Fetch error — assume allowed
    return true;
  }
}

// ── Source Confidence ─────────────────────────────────────────────────────────

const OFFICIAL_DOMAINS = new Set([
  'github.com',
  'docs.github.com',
  'developer.mozilla.org',
  'nodejs.org',
  'fastify.io',
  'npmjs.com',
  'typescriptlang.org',
  'drizzle.team',
  'react.dev',
]);

const MEDIUM_DOMAINS = new Set([
  'stackoverflow.com',
  'medium.com',
  'dev.to',
  'smashingmagazine.com',
  'hashnode.dev',
]);

/**
 * Assign confidence score and trust tier based on source domain authority.
 * Source authority (not LLM self-assessment) is the locked decision.
 */
function sourceConfidence(url: string): { score: number; tier: 'low' | 'medium' | 'high' } {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return { score: 40, tier: 'low' };
  }

  if (OFFICIAL_DOMAINS.has(hostname)) {
    return { score: 85, tier: 'high' };
  }
  if (MEDIUM_DOMAINS.has(hostname)) {
    return { score: 55, tier: 'medium' };
  }
  if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) {
    return { score: 30, tier: 'low' };
  }
  return { score: 40, tier: 'low' };
}

// ── PII Scrubbing ─────────────────────────────────────────────────────────────

const PII_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // emails
  /\B@[A-Za-z0-9_]{2,}\b/g,                                    // @handles (min 2 chars)
  /\b\+?[\d][\d\s\-().]{7,}\d\b/g,                             // phone numbers
];

function scrubPII(text: string): string {
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(new RegExp(pattern.source, pattern.flags), '[REDACTED]');
  }
  return clean;
}

// ── Politeness delay ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Source Fetchers ───────────────────────────────────────────────────────────

/**
 * Search the web via DuckDuckGo using duck-duck-scrape.
 * Counts as 1 request against session budget.
 * Returns empty on error — never throws.
 */
async function searchWeb(
  query: string,
  budget: SessionBudget,
): Promise<{ content: string[]; visits: SourceVisit[] }> {
  if (budget.capped) return { content: [], visits: [] };

  budget.consume(1);
  const fetchedAt = Date.now();

  try {
    const results = await search(query, { safeSearch: 0 });
    await delay(POLITENESS_DELAY_MS);

    if (results.noResults || !results.results.length) {
      return { content: [], visits: [] };
    }

    const content: string[] = [];
    const visits: SourceVisit[] = [];

    for (const r of results.results.slice(0, 5)) {
      content.push(`Title: ${r.title}\nURL: ${r.url}\nDescription: ${r.description}`);
      visits.push({
        url: r.url,
        source_type: 'web',
        fetched_at: fetchedAt,
        http_status: 200,
        robots_blocked: false,
      });
    }

    return { content, visits };
  } catch (err) {
    console.warn('[learner] DuckDuckGo search failed:', (err as Error).message);
    await delay(POLITENESS_DELAY_MS);
    return { content: [], visits: [] };
  }
}

/**
 * Search GitHub repositories for a given query using Octokit.
 * Falls back to unauthenticated Octokit if no GitHub connection exists.
 * Counts as 1 request against session budget.
 * Returns empty on 401/403 or any error — never throws.
 */
async function searchGitHub(
  query: string,
  budget: SessionBudget,
): Promise<{ content: string[]; visits: SourceVisit[] }> {
  if (budget.capped) return { content: [], visits: [] };

  budget.consume(1);
  const fetchedAt = Date.now();

  let octokit;
  try {
    octokit = await getGitHubClient();
  } catch {
    // No connected GitHub account — use unauthenticated Octokit
    const { Octokit } = await import('octokit');
    octokit = new Octokit();
  }

  try {
    const resp = await octokit.request('GET /search/repositories', {
      q: query,
      sort: 'stars',
      per_page: 5,
    });

    await delay(1000);

    const content: string[] = [];
    const visits: SourceVisit[] = [];

    for (const repo of resp.data.items) {
      content.push(
        `Repo: ${repo.full_name}\nDescription: ${repo.description || 'No description'}\nURL: ${repo.html_url}\nStars: ${repo.stargazers_count}`,
      );
      visits.push({
        url: repo.html_url,
        source_type: 'github',
        fetched_at: fetchedAt,
        http_status: 200,
        robots_blocked: false,
      });
    }

    return { content, visits };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      console.warn('[learner] GitHub search rate limited or unauthorized, skipping');
    } else {
      console.warn('[learner] GitHub search failed:', (err as Error).message);
    }
    await delay(1000);
    return { content: [], visits: [] };
  }
}

/**
 * Fetch top posts from a Reddit subreddit using the public .json endpoint.
 * Checks robots.txt before fetching.
 * Counts as 1 request against session budget.
 * Returns empty on 429 or any error — never throws.
 */
async function searchReddit(
  subreddit: string,
  budget: SessionBudget,
): Promise<{ content: string[]; visits: SourceVisit[] }> {
  if (budget.capped) return { content: [], visits: [] };

  const redditUrl = `https://www.reddit.com/r/${subreddit}/top.json?limit=10&t=month`;
  const fetchedAt = Date.now();

  // Check robots.txt before consuming budget (robots fetches are free)
  const allowed = await isAllowedByRobots(redditUrl);
  if (!allowed) {
    console.warn(`[learner] robots.txt disallows fetching r/${subreddit}`);
    return {
      content: [],
      visits: [
        {
          url: redditUrl,
          source_type: 'reddit',
          fetched_at: fetchedAt,
          http_status: 0,
          robots_blocked: true,
        },
      ],
    };
  }

  budget.consume(1);

  try {
    const resp = await fetch(redditUrl, {
      headers: { 'User-Agent': LEARNER_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn(`[learner] Reddit rate limited on r/${subreddit}`);
      } else {
        console.warn(`[learner] Reddit returned HTTP ${resp.status} for r/${subreddit}`);
      }
      return {
        content: [],
        visits: [
          {
            url: redditUrl,
            source_type: 'reddit',
            fetched_at: fetchedAt,
            http_status: resp.status,
            robots_blocked: false,
          },
        ],
      };
    }

    const json = await resp.json() as {
      data?: {
        children?: Array<{
          data?: { title?: string; selftext?: string; url?: string };
        }>;
      };
    };

    const children = json?.data?.children ?? [];
    const content: string[] = [];
    const visits: SourceVisit[] = [];

    for (const child of children) {
      const post = child.data;
      if (!post) continue;
      const title = (post.title ?? '').slice(0, 500);
      const selftext = (post.selftext ?? '').slice(0, 500);
      const postUrl = post.url ?? redditUrl;
      content.push(`Reddit Post: ${title}\n${selftext}`);
      visits.push({
        url: postUrl,
        source_type: 'reddit',
        fetched_at: fetchedAt,
        http_status: 200,
        robots_blocked: false,
      });
    }

    return { content, visits };
  } catch (err) {
    console.warn(`[learner] Reddit fetch failed for r/${subreddit}:`, (err as Error).message);
    return { content: [], visits: [] };
  }
}

// ── Ollama Concept Extraction ─────────────────────────────────────────────────

/**
 * Extract structured expertise concepts from content chunks using Ollama/Qwen.
 * Calls Ollama directly — never through AI router.
 * Applies scrubPII() to every extracted concept content.
 * Returns empty concepts on parse failure — never throws.
 * Counts as 1 request against session budget.
 */
async function extractConcepts(
  contentChunks: string[],
  topic: string,
  sourceUrl: string,
  budget: SessionBudget,
): Promise<OllamaExtractionResult> {
  if (budget.capped || contentChunks.length === 0) {
    return { concepts: [], domainActivity: 50 };
  }

  budget.consume(1);

  const contentBlock = contentChunks.join('\n\n---\n\n').slice(0, 2000);

  const prompt = `You are a knowledge extraction engine for a domain expert AI agent.
Analyze the following web content about "${topic}" and extract ONLY domain knowledge.

STRICT RULES:
- Extract patterns, best practices, tradeoffs, and decision frameworks
- NEVER extract personal information: no email addresses, usernames, personal names, phone numbers
- Output structured expertise, not encyclopedic facts
- Each concept must be a standalone actionable insight

Content:
${contentBlock}

Return ONLY this exact JSON:
{
  "concepts": [
    {
      "content": "<one concrete insight, pattern, or best practice - max 200 chars>",
      "concept_type": "pattern|tradeoff|best_practice|decision_framework|common_mistake"
    }
  ],
  "domain_activity": <integer 0-100>
}`;

  try {
    const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt,
        stream: false,
        format: 'json',
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.warn(`[learner] Ollama returned HTTP ${resp.status}`);
      return { concepts: [], domainActivity: 50 };
    }

    const data = await resp.json() as { response: string };
    if (!data.response) {
      console.warn('[learner] Ollama returned empty response');
      return { concepts: [], domainActivity: 50 };
    }

    // Strip markdown code fences before JSON.parse (Qwen sometimes wraps output)
    let cleaned = data.response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: { concepts?: Array<{ content?: string; concept_type?: string }>; domain_activity?: number };
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[learner] Failed to parse Ollama JSON:', (e as Error).message, 'Raw:', cleaned.slice(0, 200));
      return { concepts: [], domainActivity: 50 };
    }

    const domainActivity = typeof parsed.domain_activity === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.domain_activity)))
      : 50;

    const { score, tier } = sourceConfidence(sourceUrl);

    const concepts: ExtractedConcept[] = (parsed.concepts ?? [])
      .filter(c => typeof c.content === 'string' && c.content.trim())
      .map(c => ({
        content: scrubPII(c.content!.slice(0, 200)),
        concept_type: typeof c.concept_type === 'string' ? c.concept_type : 'pattern',
        source_url: sourceUrl,
        confidence_score: score,
        trust_tier: tier,
      }));

    return { concepts, domainActivity };
  } catch (err) {
    console.warn('[learner] Ollama extraction failed:', (err as Error).message);
    return { concepts: [], domainActivity: 50 };
  }
}

// ── Subreddit Mapping ─────────────────────────────────────────────────────────

function getSubredditsForCategory(category: string): string[] {
  const mapping: Record<string, string[]> = {
    marketing: ['marketing', 'digitalmarketing', 'PPC'],
    engineering: ['programming', 'webdev', 'typescript'],
    design: ['web_design', 'UI_Design', 'userexperience'],
    sales: ['sales', 'startups'],
    support: ['customerservice', 'sysadmin'],
    content: ['content_marketing', 'copywriting'],
    data: ['datascience', 'analytics'],
    operations: ['devops', 'projectmanagement'],
    finance: ['FinancialPlanning', 'accounting'],
    hr: ['humanresources', 'recruiting'],
  };
  return mapping[category?.toLowerCase()] ?? ['technology'];
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateConcepts(concepts: ExtractedConcept[]): ExtractedConcept[] {
  const seen = new Set<string>();
  return concepts.filter(c => {
    const key = c.content.slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Run a full autonomous learning session for a given agent template.
 *
 * Orchestrates three source fetchers (web, GitHub, Reddit) across up to
 * three research iterations, extracts concepts via Ollama/Qwen, scrubs PII,
 * assigns confidence scores by source domain authority, and writes results
 * to the concepts and learning_sessions tables.
 *
 * Throws only for: template not found, DB write failure.
 * All source and extraction failures are caught and logged silently.
 */
export async function runLearningSession(templateId: string): Promise<LearningSessionResult> {
  // 1. Load template from DB
  const template = (await pool.query(
    'SELECT id, name, category, description, tags FROM agent_templates WHERE id = $1',
    [templateId],
  )).rows[0] as {
    id: string;
    name: string;
    category: string;
    description: string;
    tags: string;
  } | undefined;

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // 2. Initialise session
  const budget = new SessionBudget(MAX_REQUESTS_PER_SESSION);
  const startMs = Date.now();
  const allConcepts: ExtractedConcept[] = [];
  const allVisits: SourceVisit[] = [];
  let lastDomainActivity = 50;

  // 3. Build search query
  const descSnippet = (template.description ?? '').slice(0, 100);
  const searchQuery = `${template.name} ${template.category} ${descSnippet}`.trim();

  // 4. Subreddits for template category
  const subreddits = getSubredditsForCategory(template.category);

  // ── Iteration 1: Broad search ─────────────────────────────────────────────

  const webResult1 = await searchWeb(searchQuery, budget);
  allVisits.push(...webResult1.visits);

  const ghResult1 = await searchGitHub(searchQuery, budget);
  allVisits.push(...ghResult1.visits);

  const redditResult1 = await searchReddit(subreddits[0], budget);
  allVisits.push(...redditResult1.visits);

  const allContent1 = [...webResult1.content, ...ghResult1.content, ...redditResult1.content];
  const sourceUrl1 = allVisits.find(v => v.source_type === 'web')?.url ?? `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`;

  const extraction1 = await extractConcepts(allContent1, template.name, sourceUrl1, budget);
  allConcepts.push(...extraction1.concepts);
  lastDomainActivity = extraction1.domainActivity;

  // ── Iteration 2: Gap refinement ───────────────────────────────────────────

  if (budget.remaining >= 4) {
    // Build refined query from lowest-confidence extracted area
    const lowConfidenceConcept = extraction1.concepts
      .sort((a, b) => a.confidence_score - b.confidence_score)
      .find(c => c.content.length > 10);

    const refinedQuery = lowConfidenceConcept
      ? `${template.name} ${lowConfidenceConcept.concept_type} best practices`
      : `${template.name} advanced techniques`;

    const webResult2 = await searchWeb(refinedQuery, budget);
    allVisits.push(...webResult2.visits);

    const sourceUrl2 = webResult2.visits[0]?.url ?? sourceUrl1;
    const extraction2 = await extractConcepts(webResult2.content, template.name, sourceUrl2, budget);
    allConcepts.push(...extraction2.concepts);
    if (extraction2.domainActivity > lastDomainActivity) {
      lastDomainActivity = extraction2.domainActivity;
    }
  }

  // ── Iteration 3: Depth pass ───────────────────────────────────────────────

  if (budget.remaining >= 3 && subreddits.length > 1) {
    const redditResult2 = await searchReddit(subreddits[1], budget);
    allVisits.push(...redditResult2.visits);

    const sourceUrl3 = redditResult2.visits[0]?.url ?? `https://reddit.com/r/${subreddits[1]}`;
    const extraction3 = await extractConcepts(redditResult2.content, template.name, sourceUrl3, budget);
    allConcepts.push(...extraction3.concepts);
  }

  // 9. Deduplicate
  const uniqueConcepts = deduplicateConcepts(allConcepts);

  // 10. Generate session ID
  const sessionId = crypto.randomUUID();

  // 11. Write concepts to DB in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of uniqueConcepts) {
      await client.query(
        `INSERT INTO concepts
           (id, memory_kind, trust_tier, scope, scope_id, content, source_type, source_url, confidence_score, session_id)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),  // id
          'concept',            // memory_kind
          c.trust_tier,         // trust_tier
          'agent',              // scope — template-scoped (locked decision)
          templateId,           // scope_id
          c.content,            // content
          'learning',           // source_type
          c.source_url,         // source_url
          c.confidence_score,   // confidence_score
          sessionId,            // session_id
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 12. Calculate confidence distribution
  const confidenceDistribution = uniqueConcepts.reduce(
    (acc, c) => {
      acc[c.trust_tier] = (acc[c.trust_tier] ?? 0) + 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  const durationMs = Date.now() - startMs;

  // 13. Write learning_sessions record
  await pool.query(
    `INSERT INTO learning_sessions
       (id, template_id, sources_visited, concepts_retained, confidence_distribution, capped, duration_ms)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sessionId,
      templateId,
      JSON.stringify(allVisits),
      uniqueConcepts.length,
      JSON.stringify(confidenceDistribution),
      budget.capped ? 1 : 0,
      durationMs,
    ],
  );

  // 14. Return result
  return {
    session_id: sessionId,
    template_id: templateId,
    sources_visited: allVisits,
    concepts_retained: uniqueConcepts.length,
    confidence_distribution: confidenceDistribution,
    capped: budget.capped,
    duration_ms: durationMs,
    domain_activity: lastDomainActivity,
  };
}
