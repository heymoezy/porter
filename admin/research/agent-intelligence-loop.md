# Agent Intelligence Loop — Research & Implementation Plan

## Core Principle
Every Porter agent follows: **Research → Report → Act (conditionally)**

No agent takes action without first researching the impact and posting to the Intelligence Feed. This is Porter's defining behavior — predictable, transparent, auditable AI.

## The Loop

```
1. TRIGGER → something happens (version update available, health check failed, cost spike)
2. RESEARCH → agent investigates (read changelog, check dependencies, assess impact)
3. REPORT → post to Intelligence Feed with findings + recommendation
4. DECIDE → if safe: act automatically. if risky: wait for human review
5. ACT → execute the action
6. LOG → post result back to Intelligence Feed
```

## Implementation Phases

### Phase A: Intelligence Integration Layer (backend)
- New service: `services/agent-loop.ts`
- Provides `researchAndAct(agentId, action, researchFn, actionFn)`
- Automatically posts to intelligence_feed before and after actions
- Respects risk levels: LOW (auto-act), MEDIUM (act + notify), HIGH (wait for review)

### Phase B: Bridge Operator Integration
- Gateway update: research changelog → post capability/blocker → update if safe
- Gateway restart: check if anything depends on it → post → restart
- Health failure: diagnose → post blocker → attempt fix

### Phase C: All Agent Integration
- Model Scout: before enabling/disabling models → research impact on routing
- Route Analyst: before changing rules → simulate impact on dispatch patterns
- Cost Controller: before budget changes → project cost impact

### Phase D: Intelligence Feed Agents
- Intelligence Curator: reviews incoming entries, deduplicates, prioritizes
- Intelligence Analyst: spots patterns across entries (recurring blockers, etc.)

## Risk Levels

| Level | Behavior | Example |
|-------|----------|---------|
| LOW | Auto-act, post result | Health ping returned ok |
| MEDIUM | Act + post warning | Restarted gateway after timeout |
| HIGH | Post blocker, wait for review | Major version update with breaking changes |
| CRITICAL | Post blocker, alert admin | Gateway down, no fallback available |

## Intelligence Entry Format for Agent Actions

```json
{
  "source_agent": "bridge-operator",
  "entry_type": "capability",  // or blocker/gap
  "title": "OpenClaw 2026.3.24 — WhatsApp broadcast API added",
  "body": "Changelog analysis:\n- New: WhatsApp broadcast endpoint\n- New: Telegram group messaging\n- Breaking: /v1/messages renamed to /v1/send\n\nRecommendation: Update safe, but Porter's messaging module needs to update the endpoint path.",
  "metadata": {
    "risk_level": "medium",
    "action": "gateway_update",
    "gateway": "openclaw",
    "current_version": "2026.3.13",
    "target_version": "2026.3.24",
    "breaking_changes": ["/v1/messages → /v1/send"],
    "auto_acted": false,
    "requires_review": true
  }
}
```

## What Changes in Existing Code

1. **Gateway version service** (`services/gateway-versions.ts`)
   - After detecting updates: post capability entries to intelligence_feed
   - Include what's new, what's breaking, risk assessment

2. **Bridge speed-test / update endpoints**
   - Before running update: check intelligence_feed for blockers on this gateway
   - After update: post result to intelligence_feed

3. **Future: All agent actions**
   - Every mutation that changes system state goes through the loop
   - Intelligence Feed becomes the audit trail of all agent decisions
