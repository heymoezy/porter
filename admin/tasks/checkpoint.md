# Checkpoint
project: porter-admin
task: v4.0 Admin Consolidation — Bridge + Intelligence + System Prompts
status: in_progress
step: v2.10.0+ — Bridge gateway editor, SSE, prompt pipeline

## Current Version: v2.10.0 (package.json) + ~15 commits ahead

## What's Done This Session

### Bridge Page (Operator Tab)
- Gateway cards: version detection at startup, latest version checking
- Update button → runs update_cmd → re-probes → shows result + restart
- Remount button on all gateways
- Config editor (⚙️): port + token with Save & Restart — only on gateways with editable fields
- File editor (📄): left nav with System Prompt (editable) + config files (read-only)
  - OpenClaw: 13 config files (openclaw.json, SOUL.md, IDENTITY.md, AGENTS.md, USER.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md, models.json, paired.json, exec-approvals.json, cron/jobs.json, config-health.json)
  - Claude CLI: 3 CLAUDE.md files (global, porter, admin)
  - Codex: config.toml, version.json, models_cache.json
  - Gemini: GEMINI.md, settings.json
- Operator Activity log (LLMTerminal): all manual actions logged ([manual] paused/restarted/token changed/etc)
- Activity log auto-fills remaining screen height
- Model dots gray (unverified — Scout's job)
- No lies: only show version when detected, only show health when probed

### Admin SSE
- New /api/admin/events SSE endpoint
- Emits: bridge:config-changed, bridge:restarted, bridge:updated
- Frontend subscribes to both Brain SSE + Admin SSE
- No more manual refresh needed

### Intelligence Feed (v2.9.0)
- Central feed: agents dump discoveries/blockers/ideas
- "Add Feature Idea" button
- Gateway version probe auto-posts (deduplicated)
- All gateway actions logged to Intelligence

### System Prompt Pipeline (v2.10.0)
- prompt-pipeline.ts: per-gateway Porter system prompt
- Brain's ai-router.ts wired to lookup agent_templates.system_prompt
- Brain's stream-service.ts uses dynamic prompt (removed hardcoded PORTER_SYSTEM)
- Brain's chat.ts passes system prompt to streaming backend

### Agent Intelligence Loop
- agent-loop.ts: research-before-act principle
- All gateway actions logged to Intelligence before execution

### Infrastructure
- systemd user service (auto-restart)
- 0.0.0.0 binding

## Still TODO
- [ ] System prompt needs proper research (Moe said current prompts are terrible)
- [ ] System prompt Save button needs actual persistence (currently just local state)
- [ ] Scout tab: model verification (actual pings)
- [ ] Intelligence agents
- [ ] Brain + Admin merge
- [ ] Dashboard mock data replacement
- [ ] Version bump + changelog for recent commits

## Key Files Modified
- frontend/app/routes/bridge.tsx — main Bridge page
- backend/src/routes/bridge.ts — gateway APIs + SSE emitting
- backend/src/services/gateway-versions.ts — startup probe + version detection
- backend/src/services/prompt-pipeline.ts — per-gateway prompt construction
- backend/src/services/agent-loop.ts — intelligence integration
- backend/src/services/admin-sse.ts — Admin SSE hub
- frontend/app/hooks/use-admin-sse.ts — dual SSE subscription
- frontend/app/routes/intelligence.tsx — Intelligence Feed page
- backend/src/routes/intelligence.ts — Intelligence CRUD API

## Brain Repo Changes (heymoezy/porter)
- backend/src/services/ai-router.ts — systemPrompt lookup from template
- backend/src/services/stream-service.ts — dynamic prompt, removed hardcoded
- backend/src/routes/v1/chat.ts — passes system prompt to streaming
