/**
 * approval-gate.ts — Approval Gate for High-Risk Actions
 *
 * Phase 45 Plan 02 (PCP-03): Classifies task risk and manages the approval
 * lifecycle. High-risk actions (code mutation, external API calls, file
 * deletion, system config changes) are paused pending explicit user approval.
 *
 * Exports:
 *   - classifyRisk()          — pure sync risk classifier
 *   - createApprovalRequest() — inserts pending approval row + msg_bus audit
 *   - approveRequest()        — approves a pending request
 *   - rejectRequest()         — rejects a pending request
 *   - listPendingApprovals()  — returns all pending requests
 *   - getApprovalRequest()    — fetches a single request by id
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { logMsgBusEvent } from '../msg-bus.js';
import type { DelegationRequest } from '../bridge/agent-delegation.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'high';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

export interface ApprovalRequest {
  id: string;
  correlationId: string | null;
  sourceAgent: string;
  targetAgent: string | null;
  task: string;
  riskLevel: string;
  riskReasons: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  rejectionReason: string | null;
}

// ── Risk classification patterns ─────────────────────────────────────────────

interface RiskPattern {
  regex: RegExp;
  category: string;
}

const HIGH_RISK_PATTERNS: RiskPattern[] = [
  // Code mutation
  {
    regex: /\b(rm\s+-rf|delete\s+file|remove\s+file|unlink|write\s+file|overwrite|truncate|modify\s+source|edit\s+code|patch\s+file|git\s+push\s+--force|git\s+reset\s+--hard)\b/i,
    category: 'Code mutation',
  },
  // External API calls
  {
    regex: /\b(curl\s+.*-X\s+(POST|PUT|DELETE|PATCH)|fetch\s*\(|http(s)?:\/\/.*\/(api|webhook)|send\s+email|send\s+webhook|post\s+to\s+api|call\s+external)\b/i,
    category: 'External API call',
  },
  // File deletion
  {
    regex: /\b(delete|remove|drop|destroy|wipe|purge)\s+(file|directory|folder|database|table|schema|collection|bucket)\b/i,
    category: 'File/resource deletion',
  },
  // System config
  {
    regex: /\b(systemctl|service\s+(restart|stop)|kill\s+-9|chmod|chown|iptables|env\s+set|config\s+change|modify\s+config)\b/i,
    category: 'System configuration',
  },
  // Dangerous SQL operations
  {
    regex: /\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;|ALTER\s+TABLE.*DROP)\b/i,
    category: 'Dangerous SQL operation',
  },
];

// ── classifyRisk ─────────────────────────────────────────────────────────────

/**
 * Pure synchronous risk classifier.
 * Scans the task string for high-risk patterns and returns a RiskAssessment.
 */
export function classifyRisk(task: string): RiskAssessment {
  const reasons: string[] = [];

  for (const pattern of HIGH_RISK_PATTERNS) {
    const match = task.match(pattern.regex);
    if (match) {
      reasons.push(`${pattern.category} detected: ${match[0]}`);
    }
  }

  if (reasons.length > 0) {
    return { level: 'high', reasons };
  }

  return { level: 'none', reasons: [] };
}

// ── Row mapper ───────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row.id as string,
    correlationId: (row.correlation_id as string) ?? null,
    sourceAgent: row.source_agent as string,
    targetAgent: (row.target_agent as string) ?? null,
    task: row.task as string,
    riskLevel: row.risk_level as string,
    riskReasons: (row.risk_reasons as string[]) ?? [],
    status: row.status as ApprovalRequest['status'],
    requestedAt: row.requested_at as number,
    resolvedAt: (row.resolved_at as number) ?? null,
    resolvedBy: (row.resolved_by as string) ?? null,
    rejectionReason: (row.rejection_reason as string) ?? null,
  };
}

// ── createApprovalRequest ────────────────────────────────────────────────────

/**
 * Inserts a new approval_requests row with status='pending'.
 * Logs to msg_bus_events with intent='approval_requested'.
 */
export async function createApprovalRequest(opts: {
  task: string;
  correlationId?: string;
  sourceAgent?: string;
  targetAgent?: string;
  riskAssessment: RiskAssessment;
  delegationRequest?: DelegationRequest;
}): Promise<ApprovalRequest> {
  const id = crypto.randomUUID();
  const source = opts.sourceAgent ?? 'porter';

  await pool.query(
    `INSERT INTO approval_requests
       (id, correlation_id, source_agent, target_agent, task, risk_level, risk_reasons, status, delegation_request)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
    [
      id,
      opts.correlationId ?? null,
      source,
      opts.targetAgent ?? null,
      opts.task,
      opts.riskAssessment.level,
      JSON.stringify(opts.riskAssessment.reasons),
      opts.delegationRequest ? JSON.stringify(opts.delegationRequest) : null,
    ],
  );

  // Audit trail
  try {
    await logMsgBusEvent({
      correlationId: opts.correlationId,
      sourceAgent: source,
      targetAgent: opts.targetAgent,
      intent: 'approval_requested',
      payload: {
        approvalId: id,
        riskLevel: opts.riskAssessment.level,
        riskReasons: opts.riskAssessment.reasons,
        task: opts.task.slice(0, 500),
      },
      hopCount: 0,
    });
  } catch { /* non-critical — never block approval creation */ }

  // Fetch and return the created row
  const result = await pool.query(
    `SELECT * FROM approval_requests WHERE id = $1`,
    [id],
  );
  return mapRow(result.rows[0]);
}

// ── approveRequest ───────────────────────────────────────────────────────────

/**
 * Approves a pending request. Returns null if not found or not pending.
 * Logs to msg_bus_events with intent='approval_granted'.
 */
export async function approveRequest(
  id: string,
  approvedBy: string,
): Promise<ApprovalRequest | null> {
  const result = await pool.query(
    `UPDATE approval_requests
     SET status = 'approved',
         resolved_at = EXTRACT(EPOCH FROM NOW()),
         resolved_by = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, approvedBy],
  );

  if (!result.rows[0]) return null;

  // Audit trail
  try {
    await logMsgBusEvent({
      correlationId: result.rows[0].correlation_id,
      sourceAgent: approvedBy,
      intent: 'approval_granted',
      payload: {
        approvalId: id,
        approvedBy,
      },
      hopCount: 0,
    });
  } catch { /* non-critical */ }

  return mapRow(result.rows[0]);
}

// ── rejectRequest ────────────────────────────────────────────────────────────

/**
 * Rejects a pending request. Returns null if not found or not pending.
 * Logs to msg_bus_events with intent='approval_rejected'.
 */
export async function rejectRequest(
  id: string,
  rejectedBy: string,
  reason?: string,
): Promise<ApprovalRequest | null> {
  const result = await pool.query(
    `UPDATE approval_requests
     SET status = 'rejected',
         resolved_at = EXTRACT(EPOCH FROM NOW()),
         resolved_by = $2,
         rejection_reason = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, rejectedBy, reason ?? null],
  );

  if (!result.rows[0]) return null;

  // Audit trail
  try {
    await logMsgBusEvent({
      correlationId: result.rows[0].correlation_id,
      sourceAgent: rejectedBy,
      intent: 'approval_rejected',
      payload: {
        approvalId: id,
        rejectedBy,
        reason: reason ?? null,
      },
      hopCount: 0,
    });
  } catch { /* non-critical */ }

  return mapRow(result.rows[0]);
}

// ── listPendingApprovals ─────────────────────────────────────────────────────

/**
 * Returns all rows with status='pending', ordered by requested_at DESC.
 */
export async function listPendingApprovals(): Promise<ApprovalRequest[]> {
  const result = await pool.query(
    `SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY requested_at DESC`,
  );
  return result.rows.map(mapRow);
}

// ── getApprovalRequest ───────────────────────────────────────────────────────

/**
 * Fetches a single approval request by id.
 */
export async function getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
  const result = await pool.query(
    `SELECT * FROM approval_requests WHERE id = $1`,
    [id],
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}
