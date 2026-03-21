import { sqlite } from '../db/client.js';

// ── Model cost rates (per 1K tokens) ───────────────────
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'openai-codex/gpt-5.4': { input: 0.01, output: 0.03 },
  'qwen2.5-coder:1.5b': { input: 0, output: 0 },
  'default': { input: 0.005, output: 0.015 },
};

const PLAN_MRR: Record<string, number> = {
  free: 0, cloud: 5, cloud_team: 25, enterprise: 100,
};

export function getModelCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_COSTS[model] ?? MODEL_COSTS['default'];
  return (inputTokens / 1000 * rate.input) + (outputTokens / 1000 * rate.output);
}

export function getMrr(plan: string): number {
  return PLAN_MRR[plan] ?? 0;
}

// ── Score computation ──────────────────────────────────
export function computeScores(username: string) {
  const now = Date.now() / 1000;

  const user = sqlite.prepare('SELECT created_at FROM users WHERE username = ?').get(username) as any;
  if (!user) return null;

  const daysSinceJoin = user.created_at ? (now - user.created_at) / 86400 : 0;

  const lastSeen = sqlite.prepare(
    'SELECT MAX(last_seen_at) as t FROM sessions WHERE username = ?'
  ).get(username) as any;
  const daysSinceSeen = lastSeen?.t ? (now - lastSeen.t) / 86400 : 999;

  const projects = (sqlite.prepare(
    'SELECT COUNT(*) as c FROM projects WHERE owner_id = ?'
  ).get(username) as any).c;

  const chats = (sqlite.prepare(
    'SELECT COUNT(*) as c FROM chats WHERE username = ?'
  ).get(username) as any).c;

  const agents = (sqlite.prepare(
    'SELECT COUNT(*) as c FROM personas WHERE owner = ?'
  ).get(username) as any).c;

  let plan = 'free', subStatus = 'none';
  try {
    const sub = sqlite.prepare(
      'SELECT plan, status FROM subscriptions WHERE username = ?'
    ).get(username) as any;
    if (sub) { plan = sub.plan; subStatus = sub.status; }
  } catch {}

  const mrr = getMrr(plan);

  // Token cost this month
  const tokens = sqlite.prepare(`
    SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out
    FROM token_usage_daily WHERE date >= strftime('%Y-%m-01', 'now')
  `).get() as any;
  const cost = getModelCost('default', tokens.inp, tokens.out);
  const margin = mrr - cost;

  // Login frequency (last 30 days)
  let loginCount = 0;
  try {
    loginCount = (sqlite.prepare(
      "SELECT COUNT(*) as c FROM customer_events WHERE username = ? AND event_type = 'login' AND created_at > ?"
    ).get(username, now - 30 * 86400) as any).c;
  } catch {}

  // Shares
  let shareCount = 0;
  try {
    shareCount = (sqlite.prepare(
      "SELECT COUNT(*) as c FROM customer_events WHERE username = ? AND event_type = 'share'"
    ).get(username) as any).c;
  } catch {}

  // Invites
  let invitesSent = 0, invitesConverted = 0;
  try {
    invitesSent = (sqlite.prepare(
      'SELECT COUNT(*) as c FROM invites WHERE created_by = ?'
    ).get(username) as any).c;
    invitesConverted = (sqlite.prepare(
      'SELECT COUNT(*) as c FROM invite_uses iu JOIN invites iv ON iu.invite_code = iv.code WHERE iv.created_by = ?'
    ).get(username) as any).c;
  } catch {}

  // ── Health (0-100) ───────────────────────────────────
  let health = 50;
  if (daysSinceSeen < 1) health += 20;
  else if (daysSinceSeen < 3) health += 15;
  else if (daysSinceSeen < 7) health += 5;
  else if (daysSinceSeen > 14) health -= 15;
  else if (daysSinceSeen > 30) health -= 30;
  if (projects > 0) health += 10;
  if (agents > 0) health += 5;
  if (plan !== 'free') health += 10;
  if (margin < 0) health -= 10;
  if (loginCount > 10) health += 5;

  // ── Conversion score (0-100) ─────────────────────────
  let conversion = 0;
  if (plan === 'free') {
    if (projects > 2) conversion += 25;
    else if (projects > 0) conversion += 15;
    if (agents > 1) conversion += 20;
    if (chats > 5) conversion += 15;
    if (daysSinceSeen < 3) conversion += 15;
    if (loginCount > 5) conversion += 10;
    if (tokens.inp + tokens.out > 50000) conversion += 15; // heavy usage
  }

  // ── Churn risk (0-100) ───────────────────────────────
  let churn = 30;
  if (daysSinceSeen > 30) churn += 40;
  else if (daysSinceSeen > 14) churn += 25;
  else if (daysSinceSeen > 7) churn += 10;
  else if (daysSinceSeen < 1) churn -= 20;
  if (projects === 0) churn += 15;
  if (loginCount < 2) churn += 10;
  if (margin < 0) churn += 5;

  // ── Viral score (0-100) ──────────────────────────────
  let viral = 0;
  if (invitesSent > 0) viral += 30;
  if (invitesConverted > 0) viral += 30 + Math.min(invitesConverted * 10, 30);
  if (shareCount > 0) viral += 10 + Math.min(shareCount * 5, 20);

  // ── LTV prediction (12mo) ───────────────────────────
  // Simple: current MRR × months remaining in year, weighted by retention probability
  const retentionProb = Math.max(0, Math.min(1, (100 - churn) / 100));
  const ltv = mrr * 12 * retentionProb;

  // ── Score breakdowns (what contributes to each) ─────
  const healthFactors: string[] = [];
  if (daysSinceSeen < 1) healthFactors.push('Active today (+20)');
  else if (daysSinceSeen < 3) healthFactors.push('Active within 3 days (+15)');
  else if (daysSinceSeen > 14) healthFactors.push(`Inactive ${Math.floor(daysSinceSeen)}d (-15)`);
  else if (daysSinceSeen > 30) healthFactors.push(`Inactive ${Math.floor(daysSinceSeen)}d (-30)`);
  if (projects > 0) healthFactors.push(`${projects} projects (+10)`);
  if (agents > 0) healthFactors.push(`${agents} agents (+5)`);
  if (plan !== 'free') healthFactors.push('Paying customer (+10)');
  if (margin < 0) healthFactors.push('Negative margin (-10)');

  const conversionFactors: string[] = [];
  if (plan === 'free') {
    if (projects > 2) conversionFactors.push(`${projects} projects — power user (+25)`);
    else if (projects > 0) conversionFactors.push(`${projects} project(s) — engaged (+15)`);
    if (agents > 1) conversionFactors.push(`${agents} agents — invested (+20)`);
    if (chats > 5) conversionFactors.push(`${chats} chats — active communicator (+15)`);
    if (daysSinceSeen < 3) conversionFactors.push('Recently active (+15)');
    if (tokens.inp + tokens.out > 50000) conversionFactors.push('Heavy token usage (+15)');
  } else {
    conversionFactors.push('Already paying');
  }

  const churnFactors: string[] = [];
  if (daysSinceSeen > 30) churnFactors.push(`${Math.floor(daysSinceSeen)}d inactive — critical (+40)`);
  else if (daysSinceSeen > 14) churnFactors.push(`${Math.floor(daysSinceSeen)}d inactive (+25)`);
  else if (daysSinceSeen < 1) churnFactors.push('Active today (-20)');
  if (projects === 0) churnFactors.push('No projects — not invested (+15)');
  if (loginCount < 2) churnFactors.push('Rarely logs in (+10)');

  const viralFactors: string[] = [];
  if (invitesSent > 0) viralFactors.push(`${invitesSent} invites sent (+30)`);
  if (invitesConverted > 0) viralFactors.push(`${invitesConverted} converted (+${30 + Math.min(invitesConverted * 10, 30)})`);
  if (shareCount > 0) viralFactors.push(`${shareCount} shares (+${10 + Math.min(shareCount * 5, 20)})`);
  if (viralFactors.length === 0) viralFactors.push('No referral activity yet');

  // ── Next action with agent assignment ──────────────
  let nextAction = { text: '', agent: '', actionType: '', priority: 50 };
  if (plan === 'free' && conversion > 60)
    nextAction = { text: 'High conversion — send upgrade offer with 20% annual discount', agent: 'growth', actionType: 'send_upgrade_nudge', priority: 90 };
  else if (plan === 'free' && conversion > 30)
    nextAction = { text: 'Warm lead — trigger in-app upgrade prompt at next feature gate', agent: 'growth', actionType: 'send_upgrade_nudge', priority: 70 };
  else if (churn > 70)
    nextAction = { text: 'Critical churn — personal outreach, offer extended trial', agent: 'retention', actionType: 'send_reengagement', priority: 95 };
  else if (churn > 50)
    nextAction = { text: 'Elevated churn — send re-engagement email with feature highlights', agent: 'retention', actionType: 'send_reengagement', priority: 60 };
  else if (plan === 'free' && projects === 0)
    nextAction = { text: 'Not activated — trigger onboarding email sequence', agent: 'growth', actionType: 'send_onboarding', priority: 80 };
  else if (viral > 50)
    nextAction = { text: 'High viral potential — enable referral rewards, surface invite prompts', agent: 'growth', actionType: 'enable_referral_rewards', priority: 65 };
  else if (margin < 0)
    nextAction = { text: 'Negative margin — review usage, consider caps or upgrade nudge', agent: 'growth', actionType: 'send_upgrade_nudge', priority: 75 };
  else if (plan !== 'free' && daysSinceSeen < 1)
    nextAction = { text: 'Healthy paying customer — consider annual plan upsell', agent: 'growth', actionType: 'send_annual_upsell', priority: 30 };
  else
    nextAction = { text: 'No urgent action — monitoring', agent: '', actionType: '', priority: 0 };

  // Queue agent task if actionable
  if (nextAction.agent && nextAction.actionType) {
    try {
      const existing = sqlite.prepare(
        "SELECT 1 FROM admin_agent_tasks WHERE target_username = ? AND action_type = ? AND status IN ('queued', 'running')"
      ).get(username, nextAction.actionType);
      if (!existing) {
        sqlite.prepare(`
          INSERT INTO admin_agent_tasks (agent_type, action_type, target_username, priority, payload)
          VALUES (?, ?, ?, ?, ?)
        `).run(nextAction.agent, nextAction.actionType, username, nextAction.priority, JSON.stringify({ reason: nextAction.text }));
      }
    } catch { /* table may not exist */ }
  }

  // Clamp all scores
  health = Math.max(0, Math.min(100, health));
  conversion = Math.max(0, Math.min(100, conversion));
  churn = Math.max(0, Math.min(100, churn));
  viral = Math.max(0, Math.min(100, viral));

  // Persist
  sqlite.prepare(`
    INSERT INTO customer_scores (username, health, conversion_score, churn_risk, viral_score, ltv_predicted, next_action, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      health=excluded.health, conversion_score=excluded.conversion_score,
      churn_risk=excluded.churn_risk, viral_score=excluded.viral_score,
      ltv_predicted=excluded.ltv_predicted, next_action=excluded.next_action,
      computed_at=excluded.computed_at
  `).run(username, health, conversion, churn, viral, Math.round(ltv * 100) / 100, nextAction.text, now);

  return {
    health, conversion, churn, viral,
    healthFactors, conversionFactors, churnFactors, viralFactors,
    ltv: Math.round(ltv * 100) / 100,
    nextAction,
    mrr, cost: Math.round(cost * 100) / 100, margin: Math.round(margin * 100) / 100,
    loginCount, shareCount, invitesSent, invitesConverted,
  };
}

// ── Admin agent task queue ─────────────────────────────
export function getAgentTasks(limit = 20) {
  try {
    return sqlite.prepare(`
      SELECT * FROM admin_agent_tasks ORDER BY priority DESC, created_at DESC LIMIT ?
    `).all(limit) as any[];
  } catch { return []; }
}

export function getAgentTaskStats() {
  try {
    const queued = (sqlite.prepare("SELECT COUNT(*) as c FROM admin_agent_tasks WHERE status = 'queued'").get() as any).c;
    const running = (sqlite.prepare("SELECT COUNT(*) as c FROM admin_agent_tasks WHERE status = 'running'").get() as any).c;
    const completed = (sqlite.prepare("SELECT COUNT(*) as c FROM admin_agent_tasks WHERE status = 'completed'").get() as any).c;
    return { queued, running, completed };
  } catch { return { queued: 0, running: 0, completed: 0 }; }
}

// ── Login history with country/IP analysis ─────────────
export function getLoginHistory(username: string) {
  try {
    return sqlite.prepare(`
      SELECT ip_address, country, created_at, event_data
      FROM customer_events
      WHERE username = ? AND event_type = 'login'
      ORDER BY created_at DESC LIMIT 50
    `).all(username) as any[];
  } catch { return []; }
}

export function getLoginAnomalies(username: string) {
  const anomalies: string[] = [];
  try {
    // Multiple countries
    const countries = sqlite.prepare(`
      SELECT DISTINCT country FROM customer_events
      WHERE username = ? AND event_type = 'login' AND country IS NOT NULL AND country != ''
    `).all(username) as any[];
    if (countries.length > 2) {
      anomalies.push(`Logins from ${countries.length} different countries: ${countries.map((c: any) => c.country).join(', ')}`);
    }

    // Unusual frequency (>20 logins in 1 hour)
    const recentBurst = sqlite.prepare(`
      SELECT COUNT(*) as c FROM customer_events
      WHERE username = ? AND event_type = 'login' AND created_at > ?
    `).get(username, Date.now() / 1000 - 3600) as any;
    if (recentBurst.c > 20) {
      anomalies.push(`${recentBurst.c} logins in the last hour — possible brute force or bot`);
    }

    // Multiple IPs in short window
    const recentIps = sqlite.prepare(`
      SELECT COUNT(DISTINCT ip_address) as c FROM customer_events
      WHERE username = ? AND event_type = 'login' AND created_at > ?
    `).get(username, Date.now() / 1000 - 86400) as any;
    if (recentIps.c > 5) {
      anomalies.push(`${recentIps.c} different IPs in last 24h — suspicious`);
    }
  } catch {}
  return anomalies;
}

// ── Backfill login events from existing sessions ───────
export function backfillLoginEvents() {
  try {
    const existing = sqlite.prepare("SELECT COUNT(*) as c FROM customer_events WHERE event_type = 'login'").get() as any;
    if (existing.c > 0) return; // already backfilled

    const sessions = sqlite.prepare(`
      SELECT DISTINCT username, ip_address, created_at
      FROM sessions
      ORDER BY created_at DESC
      LIMIT 1000
    `).all() as any[];

    const stmt = sqlite.prepare(`
      INSERT INTO customer_events (username, event_type, ip_address, created_at)
      VALUES (?, 'login', ?, ?)
    `);

    // Only insert one per distinct (username, ip, day) to avoid flooding from the session leak
    const seen = new Set<string>();
    for (const s of sessions) {
      const day = Math.floor((s.created_at ?? 0) / 86400);
      const key = `${s.username}:${s.ip_address}:${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stmt.run(s.username, s.ip_address, s.created_at);
    }
    console.log(`[backfill] ${seen.size} login events from sessions`);
  } catch {}
}
