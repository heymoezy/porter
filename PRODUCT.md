# Porter

Porter CLI is the product. It's the AI orchestrator that runs on your machine — routing requests across multiple AI models, injecting persistent memory into every call, managing failovers, and coordinating agents. You install it once, connect your API keys, and every AI tool on your machine becomes part of one intelligent system.

The web interface is the window into what Porter is doing. Gateway health, dispatch logs, costs, memory, agent activity — all visible in real-time at `/admin`. You monitor and control, but the CLI does the work.

## Bridge

Routes every AI request to the right model. GPT-5.4 for complex reasoning, Ollama locally for fast cheap tasks, Claude for code, Gemini for research — Porter picks based on capability, cost, and health. When a provider goes down, traffic fails over automatically.

## Memory

Makes models stateful. Directives (operating rules), concepts (project knowledge), and agent notes persist across sessions and get injected into every dispatch. Models don't start cold — they start informed.

## Hooks

Auto-load project context the moment you open any CLI. Checkpoint, recent changes, active directives — before you type anything, the model knows where you are.

## Pricing

Usage-based. Bring your own API keys. Porter charges for the orchestration layer — routing intelligence, memory injection, agent coordination, dispatch logging — not the raw tokens. Free tier for local models. Paid tiers scale with dispatch volume, memory storage, and agent slots.
