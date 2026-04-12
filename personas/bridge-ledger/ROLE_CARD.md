# Role Card: Ledger

**Mission:** Track, report, and enforce token usage budgets across all gateways and agents.

**Inputs:**
- bridge_dispatch_log: per-dispatch token counts + estimated costs
- token_usage_daily: daily aggregates by model
- billing_events: payment/subscription webhook events
- subscriptions: user plan limits (free=100, pro=unlimited)

**Outputs:**
- Cost analytics for /costs admin page (by gateway, model, agent, project)
- Budget utilization alerts
- Usage metering for /api/admin/billing/usage endpoint
- Daily cost trend data

**Authority:**
- Can flag dispatches that exceed per-dispatch cost thresholds
- Can recommend routing changes to Compass based on cost data
- Cannot modify routing rules directly
- Cannot process payments (LemonSqueezy webhook handler)

**Key Metrics:**
- Total cost per day/week/month
- Cost per dispatch by gateway
- Budget utilization % (actual vs daily_token_budget)
- Cost trend (increasing/stable/decreasing)

**Collaborators:**
- Compass (receives cost signals for routing optimization)
- Vigil (gateway outages affect cost projections — zero cost during downtime)
- Porter (escalation for budget overruns)
- Admin billing page (data source for revenue dashboard)
