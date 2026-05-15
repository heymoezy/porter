/**
 * contact-analyzer.ts — DEAD-PATHED in v6.9.0 Bridge consolidation.
 *
 * Originally a CRM-03 contact sentiment/engagement analyzer that called Ollama
 * directly (not through the AI router) via /api/generate with format='json'.
 *
 * As of v6.0.1 cleanup pass 3 (2026-05-15):
 * - Ollama adapter was removed from the Bridge in v6.9.0
 * - Zero contact_analysis jobs have ever been queued (agent_jobs WHERE
 *   trigger_type='contact_analysis' returns 0 rows)
 * - Scheduler still imports analyzeContact (handler for the trigger_type), so
 *   we cannot delete the export — but the function body now throws explicitly
 *   instead of silently failing on a missing Ollama daemon
 *
 * To revive in v7.0: either re-add an Ollama adapter to the Bridge and route
 * through it, or delete the entire CRM-03 pipeline (this file + the
 * trigger_type='contact_analysis' branch in scheduler.ts + the contact_analyses
 * table). The scheduler call site is wrapped in try/catch + markJobFailed, so
 * the throw here is the correct fail-loud signal for any future trigger.
 */

export interface ContactAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement_score: number;
  churn_risk: 'low' | 'medium' | 'high';
  key_topics: string[];
  last_interaction_summary: string;
  communication_style: string;
  relationship_stage: 'new' | 'active' | 'at-risk' | 'churned';
}

/**
 * @deprecated DEAD-PATHED — Bridge consolidation v6.9.0 removed the Ollama
 * adapter. This function intentionally throws to make any accidental
 * contact_analysis job revival fail loudly instead of silently 500ing on a
 * missing Ollama daemon. See module header for revival options.
 */
export async function analyzeContact(_contactId: string): Promise<ContactAnalysis> {
  throw new Error(
    'contact-analyzer disabled — Bridge consolidation v6.9.0 removed the Ollama adapter. ' +
    'Re-enable by adding an Ollama Bridge adapter and routing through routingEngine, ' +
    'or delete the CRM-03 pipeline entirely (scheduler trigger_type=contact_analysis ' +
    'branch + contact_analyses table). 0 jobs have ever been queued.'
  );
}
