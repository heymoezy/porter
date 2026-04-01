import { pool } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

// ── Intelligence Pattern Extraction — INT-01 ──────────────────────────────────
//
// Analyzes bridge_dispatch_log (last 7 days) to detect 4 pattern types:
//   1. latency_trend   — per-gateway avg + p95 latency
//   2. model_strength  — per-agent/gateway/model dispatch volume
//   3. failure_mode    — per-gateway null-latency (failure) rate
//   4. cost_pattern    — per-gateway avg + total cost
//
// Patterns with confidence >= 80 are auto-promoted to the concepts table.

interface LatencyRow {
  gateway_type: string;
  avg_latency: number;
  p95_latency: number;
  sample_count: string;
}

interface ModelStrengthRow {
  agent_id: string;
  gateway_type: string;
  model_name: string;
  dispatch_count: string;
  avg_latency: number;
  total_cost: string;
}

interface FailureModeRow {
  gateway_type: string;
  null_latency_count: string;
  failure_pct: number;
}

interface CostPatternRow {
  gateway_type: string;
  avg_cost_per_dispatch: string;
  total_cost_7d: string;
  dispatch_count: string;
}

interface PromotionCandidate {
  id: string;
  summary: string;
  gateway_type: string | null;
  agent_id: string | null;
  confidence: number;
  pattern_type: string;
}

/**
 * Deduplication check — returns true if a recent (< 6h) pattern already exists
 * for the same type + gateway_type + agent_id combination.
 */
async function isDuplicate(
  patternType: string,
  gatewayType: string | null,
  agentId: string | null
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM intelligence_patterns
     WHERE pattern_type = $1
       AND COALESCE(gateway_type, '') = COALESCE($2, '')
       AND COALESCE(agent_id, '') = COALESCE($3, '')
       AND created_at > EXTRACT(EPOCH FROM NOW()) - 21600
     LIMIT 1`,
    [patternType, gatewayType, agentId]
  );
  return rows.length > 0;
}

/**
 * Insert a new raw pattern into intelligence_patterns.
 */
async function insertPattern(
  patternType: string,
  gatewayType: string | null,
  agentId: string | null,
  summary: string,
  confidence: number,
  evidence: unknown[]
): Promise<void> {
  await pool.query(
    `INSERT INTO intelligence_patterns
       (id, pattern_type, gateway_type, agent_id, summary, evidence, confidence, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'raw', EXTRACT(EPOCH FROM NOW()))`,
    [
      uuidv4(),
      patternType,
      gatewayType,
      agentId,
      summary,
      JSON.stringify(evidence),
      confidence,
    ]
  );
}

// ── Pattern 1: latency_trend ──────────────────────────────────────────────────

async function extractLatencyTrends(): Promise<number> {
  const { rows } = await pool.query<LatencyRow>(`
    SELECT gateway_type,
           AVG(latency_ms)::int AS avg_latency,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_latency,
           COUNT(*) AS sample_count
    FROM bridge_dispatch_log
    WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
      AND latency_ms IS NOT NULL
    GROUP BY gateway_type
    HAVING COUNT(*) >= 10
    ORDER BY avg_latency ASC
  `);

  let inserted = 0;
  for (const row of rows) {
    const dup = await isDuplicate('latency_trend', row.gateway_type, null);
    if (dup) continue;

    let confidence: number;
    if (row.p95_latency < 3000) {
      confidence = 85;
    } else if (row.p95_latency > 10000) {
      confidence = 80;
    } else {
      confidence = 60;
    }

    const summary = `${row.gateway_type} avg latency ${row.avg_latency}ms (p95: ${row.p95_latency}ms) over ${row.sample_count} dispatches`;
    await insertPattern('latency_trend', row.gateway_type, null, summary, confidence, [row]);
    inserted++;
  }
  return inserted;
}

// ── Pattern 2: model_strength ─────────────────────────────────────────────────

async function extractModelStrength(): Promise<number> {
  const { rows } = await pool.query<ModelStrengthRow>(`
    SELECT agent_id, gateway_type, model_name,
           COUNT(*) AS dispatch_count,
           AVG(latency_ms)::int AS avg_latency,
           SUM(COALESCE(estimated_cost_usd, 0)) AS total_cost
    FROM bridge_dispatch_log
    WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
      AND latency_ms IS NOT NULL
      AND agent_id IS NOT NULL
    GROUP BY agent_id, gateway_type, model_name
    HAVING COUNT(*) >= 5
    ORDER BY dispatch_count DESC
    LIMIT 20
  `);

  let inserted = 0;
  for (const row of rows) {
    const dup = await isDuplicate('model_strength', row.gateway_type, row.agent_id);
    if (dup) continue;

    const dispatchCount = parseInt(row.dispatch_count, 10);
    const confidence = Math.min(95, 60 + dispatchCount * 2);
    const summary = `Agent ${row.agent_id.slice(0, 8)} routed to ${row.gateway_type}/${row.model_name} ${dispatchCount} times (avg ${row.avg_latency}ms)`;
    await insertPattern('model_strength', row.gateway_type, row.agent_id, summary, confidence, [row]);
    inserted++;
  }
  return inserted;
}

// ── Pattern 3: failure_mode ───────────────────────────────────────────────────

async function extractFailureModes(): Promise<number> {
  const { rows } = await pool.query<FailureModeRow>(`
    SELECT gateway_type,
           COUNT(*) AS null_latency_count,
           (COUNT(*)::float / NULLIF(total.all_count, 0) * 100)::int AS failure_pct
    FROM bridge_dispatch_log
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS all_count FROM bridge_dispatch_log
      WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
        AND gateway_type = bridge_dispatch_log.gateway_type
    ) total
    WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
      AND latency_ms IS NULL
    GROUP BY gateway_type, total.all_count
    HAVING COUNT(*) >= 3
  `);

  let inserted = 0;
  for (const row of rows) {
    if (row.failure_pct < 10) continue;

    const dup = await isDuplicate('failure_mode', row.gateway_type, null);
    if (dup) continue;

    const confidence = Math.min(90, 50 + row.failure_pct);
    const summary = `${row.gateway_type} failure rate: ${row.failure_pct}% (${row.null_latency_count} failures in 7 days)`;
    await insertPattern('failure_mode', row.gateway_type, null, summary, confidence, [row]);
    inserted++;
  }
  return inserted;
}

// ── Pattern 4: cost_pattern ───────────────────────────────────────────────────

async function extractCostPatterns(): Promise<number> {
  const { rows } = await pool.query<CostPatternRow>(`
    SELECT gateway_type,
           AVG(estimated_cost_usd)::numeric(10,6) AS avg_cost_per_dispatch,
           SUM(estimated_cost_usd)::numeric(10,4) AS total_cost_7d,
           COUNT(*) AS dispatch_count
    FROM bridge_dispatch_log
    WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 604800
      AND estimated_cost_usd IS NOT NULL
      AND estimated_cost_usd > 0
    GROUP BY gateway_type
    HAVING COUNT(*) >= 5
    ORDER BY avg_cost_per_dispatch ASC
  `);

  let inserted = 0;
  for (const row of rows) {
    const dup = await isDuplicate('cost_pattern', row.gateway_type, null);
    if (dup) continue;

    const confidence = 70; // cost patterns are factual but change slowly
    const summary = `${row.gateway_type} cost: avg $${row.avg_cost_per_dispatch}/dispatch, $${row.total_cost_7d} total in 7 days (${row.dispatch_count} dispatches)`;
    await insertPattern('cost_pattern', row.gateway_type, null, summary, confidence, [row]);
    inserted++;
  }
  return inserted;
}

// ── Promotion: raw patterns with confidence >= 80 → concepts ─────────────────

async function promoteHighConfidencePatterns(): Promise<number> {
  const { rows } = await pool.query<PromotionCandidate>(`
    SELECT id, summary, gateway_type, agent_id, confidence, pattern_type
    FROM intelligence_patterns
    WHERE confidence >= 80
      AND status = 'raw'
      AND promoted_to_concept_id IS NULL
  `);

  let promoted = 0;
  for (const pattern of rows) {
    const conceptId = uuidv4();

    await pool.query(
      `INSERT INTO concepts
         (id, memory_kind, trust_tier, scope, scope_id, content,
          source_type, confidence_score, status, review_state, created_at, updated_at)
       VALUES ($1, 'concept', 'high', 'global', $2, $3, 'intelligence_loop', $4, 'active', 'accepted',
         EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT DO NOTHING`,
      [conceptId, pattern.gateway_type ?? pattern.agent_id ?? null, pattern.summary, pattern.confidence]
    );

    await pool.query(
      `UPDATE intelligence_patterns
       SET status = 'promoted',
           promoted_to_concept_id = $1,
           reviewed_at = EXTRACT(EPOCH FROM NOW())
       WHERE id = $2`,
      [conceptId, pattern.id]
    );

    promoted++;
  }
  return promoted;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractIntelligencePatterns(): Promise<void> {
  try {
    const [latency, strength, failure, cost] = await Promise.all([
      extractLatencyTrends(),
      extractModelStrength(),
      extractFailureModes(),
      extractCostPatterns(),
    ]);

    const totalExtracted = latency + strength + failure + cost;
    const promoted = await promoteHighConfidencePatterns();

    console.log(`[intelligence-loop] extracted ${totalExtracted} patterns (latency:${latency} strength:${strength} failure:${failure} cost:${cost}), promoted ${promoted} concepts`);
  } catch (err) {
    console.error('[intelligence-loop] extraction error:', err instanceof Error ? err.message : err);
  }
}
