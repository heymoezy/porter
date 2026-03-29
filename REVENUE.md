# Porter Revenue Model

## Quick version

You install Porter for free. You use local AI models (Ollama) for free. We don't charge for the CLI, hooks, or local routing. That costs us nothing — it runs on your machine.

The moment you plug in a cloud API key (OpenAI, Anthropic, Google) and start routing real work through Porter, you're using our orchestration layer. That's what we charge for.

You keep your API keys. We charge for the intelligence on top:
- Picking the right model for each task (saves 40-60% on token costs)
- Memory that makes models remember context across sessions
- Automatic failover when a provider goes down
- Full audit log of every AI decision
- Coordinating multiple AI agents on the same project

Tiers:
- Free: 500 cloud dispatches/mo, 2 agents
- Pro $29/mo: 25K dispatches, 10 agents, smart routing
- Team $99/mo + $19/seat: 100K dispatches, workspaces, usage tracking
- Enterprise: custom pricing, dedicated infra, SLA

The math: ~95% gross margin. A dispatch costs us a database query and an HTTP redirect. We charge a fraction of a cent each. Volume is the game.

The flywheel: free users try with Ollama → connect cloud key → hit limit → pay. Developers build products on Porter → their users generate dispatches → more revenue. It's AWS for AI orchestration.

---

## Detailed breakdown

Porter is free to install and free to use with local AI models. The moment you connect a cloud model and start routing real work through Porter, that's when we make money.

## How it works

You bring your own API keys. OpenAI, Anthropic, Google — whatever you use. Porter doesn't touch your token spend. Instead, Porter charges for what it does on top of the raw model call: picking the right model, injecting memory so it's not stateless, catching failures and rerouting, logging every decision, and coordinating multiple AI agents on the same project.

Without Porter, you'd build all of this yourself. The API key alone is like having a phone number with no contacts, no call history, and no voicemail. Porter is the phone.

## The tiers

**Free** — no credit card, no limits on local models. You get 500 cloud dispatches a month, 2 agent workers, and a week of logs. Enough to try it, build a small project, and see the value. This costs us almost nothing because local model routing runs on the user's hardware.

**Pro at $29/month** — for developers shipping real products. 25,000 cloud dispatches, 10 agent workers, 90 days of logs, smart routing that picks the cheapest model capable of the task, and automatic failover when providers go down. If you go over 25K dispatches, it's a tenth of a cent per extra dispatch. Cheap enough nobody notices, expensive enough it adds up.

**Team at $99/month plus $19 per seat** — for teams building together. 100,000 dispatches, 50 agents, shared memory across the team, per-user API key management, and usage attribution so you know who spent what on which project. Each person brings their own keys, Porter tracks it all.

**Enterprise** — custom pricing for companies embedding Porter into their product. Dedicated infrastructure, custom models, SLA, SSO, white-label, compliance-grade audit logs. This is where the big contracts live.

## Why they pay

Smart routing alone saves 40-60% on token costs because Porter picks the cheapest model that can do the job instead of always hitting the expensive one. Memory injection means models actually remember context — that's the difference between a useful AI and a fancy autocomplete. Fallback chains mean your app doesn't break at 2am when OpenAI goes down. Dispatch logging gives compliance teams the audit trail they need. Agent coordination lets multiple AI workers share context on the same project, which you simply can't do with raw API keys.

## The math

A typical Pro user runs about 20,000 dispatches a month. Each dispatch costs us almost nothing — a database query, a routing decision, an HTTP proxy call. Total compute per dispatch is about 3 milliseconds. At $29 a month for 25,000 dispatches, gross margin is around 95%.

## How it grows

Free users try Porter with Ollama on their laptop. They connect a cloud model and start using dispatches. They hit the free limit and convert to Pro. They invite teammates and convert to Team. They build a product on top of Porter and their users start generating dispatches too — that's Enterprise. Every layer of the stack generates more API calls flowing through Porter's Bridge.

The CLI being free is the distribution strategy. Every developer who installs Porter becomes a paying customer the moment they connect a cloud key and start relying on the orchestration.
