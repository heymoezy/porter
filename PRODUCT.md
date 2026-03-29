# Porter

Porter CLI is the product. It's the AI orchestrator that runs on your machine — routing requests across multiple AI models, injecting persistent memory into every call, managing failovers, and coordinating agents. You install it once, connect your API keys, and every AI tool on your machine becomes part of one intelligent system.

The web interface is the window into what Porter is doing. Gateway health, dispatch logs, costs, memory, agent activity — all visible in real-time at `/admin`. You monitor and control, but the CLI does the work.

## The 3 parts

**Bridge** — the hub. Every AI model plugs into Porter, and through Porter they can talk to each other. A smart router in the middle decides which model handles each request based on what it's good at, what it costs, and whether it's healthy. You don't pick models. Porter picks for you.

**Forge** — the factory. You create AI agents, train them on your domain, and they evolve over time based on feedback. An agent starts as a template and becomes yours — it learns your codebase, your customers, your preferences.

**Recall** — the shared brain. Every model and every agent reads from and writes to the same memory. Global rules that apply everywhere, agent-specific knowledge that makes each worker smarter, and project context that keeps everyone aligned. Nothing starts cold.

Bridge connects the models. Forge creates the workers. Recall makes them all remember. Together, that's Porter.

## Pricing

Usage-based. Bring your own API keys. Porter charges for the orchestration layer — routing intelligence, memory injection, agent coordination, dispatch logging — not the raw tokens. Free tier for local models. Paid tiers scale with dispatch volume, memory storage, and agent slots.
