/**
 * job-assignment.ts — Autonomous Job Queue: Phase 44
 *
 * Skill + capability matching engine for job assignment.
 * Selects the best agent (by persona_skills effectiveness) and
 * the best gateway (by capabilities JSONB match) for a given job.
 */

import { pool } from '../db/client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface JobAssignmentResult {
  agentId: string;
  agentName: string;
  gatewayType: string | null;
  matchReason: string;
}

// ── Agent selection by skill ─────────────────────────────────────────────────

/**
 * Find the best agent that has the given skill enabled, ordered by effectiveness.
 * Returns null if no skill constraint or no matching agent found.
 */
export async function selectBestAgent(
  requiredSkill: string | null,
): Promise<{ agentId: string; agentName: string } | null> {
  if (!requiredSkill) return null;

  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT p.id, p.name FROM personas p
     JOIN persona_skills ps ON ps.persona_id = p.id
     WHERE ps.skill_id = $1
       AND ps.enabled = 1
       AND p.status != 'retired'
       AND (p.is_temporary = 0 OR p.is_temporary IS NULL)
     ORDER BY ps.effectiveness_score DESC NULLS LAST
     LIMIT 1`,
    [requiredSkill],
  );

  if (rows.length === 0) return null;
  return { agentId: rows[0].id, agentName: rows[0].name };
}

// ── Gateway selection by capability ──────────────────────────────────────────

/**
 * Find the best active gateway matching a capability constraint.
 * Format: 'field:value' e.g. 'tool_support:full' or 'agentic:true'
 * Returns null if no capability constraint or no matching gateway found.
 */
export async function selectBestGateway(
  requiredCapability: string | null,
): Promise<string | null> {
  if (!requiredCapability) return null;

  const colonIdx = requiredCapability.indexOf(':');
  if (colonIdx < 0) return null;

  const field = requiredCapability.slice(0, colonIdx);
  const value = requiredCapability.slice(colonIdx + 1);

  const { rows } = await pool.query<{ type: string }>(
    `SELECT type FROM gateways
     WHERE status = 'active' AND enabled = 1
       AND (capabilities->>$1) = $2
     ORDER BY priority DESC
     LIMIT 1`,
    [field, value],
  );

  if (rows.length === 0) return null;
  return rows[0].type;
}

// ── Combined assignment ──────────────────────────────────────────────────────

/**
 * Assign both agent and gateway for a job based on its constraints.
 * Returns null if a required constraint cannot be satisfied.
 */
export async function assignJob(
  requiredSkill: string | null,
  requiredCapability: string | null,
): Promise<JobAssignmentResult | null> {
  const [agent, gateway] = await Promise.all([
    selectBestAgent(requiredSkill),
    selectBestGateway(requiredCapability),
  ]);

  // If a constraint was set but no match found, the job cannot be fulfilled
  if (requiredSkill && !agent) return null;
  if (requiredCapability && !gateway) return null;

  const reasons: string[] = [];
  if (agent) reasons.push(`skill:${requiredSkill} agent:${agent.agentName}`);
  if (gateway) reasons.push(`gateway:${gateway} cap:${requiredCapability}`);
  if (reasons.length === 0) reasons.push('no constraints');

  return {
    agentId: agent?.agentId ?? 'system',
    agentName: agent?.agentName ?? 'system',
    gatewayType: gateway,
    matchReason: reasons.join(' '),
  };
}
