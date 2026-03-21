# Porter Bridge — Design Brief

**Status:** Pre-Phase 5 | **Priority:** High — blocks wizard agent assignment
**Date:** 2026-03-21

---

## Core Philosophy: Porter Is Not a Middleman

Every other AI platform (Cursor, Windsurf, Naïve, etc.) is a middleman — they wrap LLM APIs, charge markup, control access, and the user never touches the underlying model directly.

**Porter is the opposite.**

- The user installs Claude CLI with their own Anthropic account
- The user installs Codex with their own OpenAI key
- The user installs Gemini with their own Google auth
- The user runs Ollama with their own hardware

Porter discovers what's on the machine and orchestrates across them. It never stands between the user and their tools. The user always has direct access — Porter just makes them work together.

This is Porter's moat. Not API wrappers. Not token markup. **Orchestration of tools the user already owns.**

**This is Porter Bridge** — the existing orchestration layer (`/api/bridge/dispatch`, `bridge:*` SSE events, `bridge_benchmarks`, circuit breakers) that already connects Porter to CLI backends. This brief is about elevating Bridge from an internal dispatch mechanism to a first-class onboarding and product concept.

---

## Current State

Porter already has the foundation:

### PROVIDER_REGISTRY (porter.py)
```python
PROVIDER_REGISTRY = {
    "codex":    {"dispatch": _dispatch_codex,    "probe": _probe_codex,    "type": "cli",     "label": "OpenAI Codex"},
    "claude":   {"dispatch": _dispatch_claude,   "probe": _probe_claude,   "type": "cli",     "label": "Claude Code"},
    "gemini":   {"dispatch": _dispatch_gemini,   "probe": _probe_gemini,   "type": "cli",     "label": "Google Gemini"},
    "openclaw": {"dispatch": _dispatch_openclaw, "probe": _probe_openclaw, "type": "gateway", "label": "OpenClaw"},
    "ollama":   {"dispatch": _dispatch_ollama,   "probe": _probe_ollama,   "type": "local",   "label": "Ollama"},
}
```

### Environment Detection (_detect_environment_tools)
Already scans PATH for 12+ tools including claude, codex, gemini, ollama. Writes results to `environment_tools` table.

### Dispatch Functions
Each backend has `_dispatch_*` and `_probe_*` functions. All normalize to a common response: `{ok, text, model, duration_ms, tokens, bridge}`.

### CLI Tool Capabilities (Installed on This Machine)

| Tool | Version | Non-Interactive Flag | Output Format | Model Control |
|------|---------|---------------------|---------------|---------------|
| Claude Code | 2.1.81 | `--print` | `--output-format json` (structured) | `--model opus\|sonnet\|haiku` |
| Codex CLI | 0.115.0 | `exec` subcommand | `--json` (JSONL streaming) | `-m gpt-5.4\|o3` |
| Gemini CLI | 0.34.0 | `--prompt` | `-o text` (JSON hangs in v0.31+) | `-m gemini-2-flash` |
| Ollama | local server | HTTP API | JSON | model param |

---

## What Needs to Change for Phase 5

### 1. Onboarding: "What Do You Have?"

The first-run wizard should:

1. **Auto-detect** installed CLI tools (already happens via `_detect_environment_tools`)
2. **Surface results visually** — show the user what Porter found with status badges
3. **Validate auth** — probe each tool to confirm it's not just installed but authenticated
4. **Guide setup** — for tools not found, show one-line install commands (not a requirement, just helpful)
5. **No Porter account needed** — Porter runs on your machine, uses your tools. Zero signup.

**UX flow:**
```
Welcome to Porter.

I found these AI tools on your machine:

  ✓ Claude Code (v2.1.81) — authenticated
  ✓ Codex CLI (v0.115.0) — authenticated
  ✓ Gemini CLI (v0.34.0) — authenticated
  ✓ Ollama (qwen2.5-coder:1.5b) — running locally

You're ready to go. These are YOUR tools — I just help them work together.

[Get Started]
```

### 2. Runtime Registry: Upgrade from Detection to Intelligence

Current `_detect_environment_tools` is binary: found or not. Needs to become smarter:

```python
CLI_RUNTIME_REGISTRY = {
    "claude": {
        "binary": "claude",
        "detect_cmd": ["claude", "--version"],
        "probe_cmd": ["claude", "-p", "--output-format", "json", "ping"],
        "strengths": ["reasoning", "analysis", "writing", "code-review"],
        "cost_tier": "premium",        # helps wizard pick cost-appropriate tools
        "agentic": True,               # can use tools, read/write files
        "output_format": "json",       # structured output
        "max_context": "200k",
        "install_hint": "npm install -g @anthropic-ai/claude-code",
    },
    "codex": {
        "binary": "codex",
        "detect_cmd": ["codex", "--version"],
        "probe_cmd": ["codex", "exec", "--json", "--ephemeral", "ping"],
        "strengths": ["coding", "refactoring", "debugging", "file-ops"],
        "cost_tier": "premium",
        "agentic": True,
        "output_format": "jsonl",
        "max_context": "200k",
        "install_hint": "npm install -g @openai/codex",
    },
    "gemini": {
        "binary": "gemini",
        "detect_cmd": ["gemini", "--version"],
        "probe_cmd": ["gemini", "-p", "ping", "-o", "text", "-y"],
        "strengths": ["multimodal", "image-analysis", "summarization", "translation"],
        "cost_tier": "standard",
        "agentic": True,
        "output_format": "text",
        "max_context": "1M",
        "install_hint": "npm install -g @anthropic-ai/gemini",  # TBD
    },
    "ollama": {
        "binary": "ollama",
        "detect_cmd": ["ollama", "--version"],
        "probe_cmd": "http://127.0.0.1:11434/api/tags",
        "strengths": ["quick-tasks", "privacy", "offline", "triage"],
        "cost_tier": "free",
        "agentic": False,
        "output_format": "json",
        "max_context": "8k-128k",  # model-dependent
        "install_hint": "curl -fsSL https://ollama.com/install.sh | sh",
    },
}
```

### 3. Smart Routing for the Wizard

When Phase 5's wizard proposes an agent team, it needs to know:
- What runtimes are available (detected + authenticated)
- What each runtime is good at (strengths)
- Cost implications (tier)
- Whether the runtime can act autonomously (agentic flag)

Example wizard logic:
```
User: "I need help managing my GitHub repos"
Porter: "Here's what I'd set up:"
  → Code Review Agent → backed by Claude Code (reasoning + code-review)
  → PR Writer Agent → backed by Codex (coding + file-ops)
  → Triage Agent → backed by Ollama (quick-tasks, free, local)
```

### 4. Direct Access Principle

Key design rules:
- **Never hide which tool is doing the work.** Show "via Claude Code" or "via Codex" on every agent response.
- **Never lock a user into Porter's dispatch.** If they want to run `claude -p "analyze this"` directly, that's fine — Porter doesn't compete with its own backends.
- **Credentials stay with the tool.** Porter never stores API keys for CLI tools. Claude CLI has its own auth. Codex has its own config. Porter just invokes the binary.
- **Model selection is transparent.** If an agent uses `claude --model sonnet`, the user sees that. No hidden model swaps.

### 5. Future: Community Runtimes

The registry should be extensible. If someone builds a new CLI tool (Aider, Continue, etc.), adding it should be:
1. Add entry to CLI_RUNTIME_REGISTRY
2. Implement `_dispatch_*` and `_probe_*`
3. Done — wizard auto-discovers it

No code changes to the dispatch pipeline, scheduler, or UI.

---

## Scope for Phase 5 Integration

This brief informs Phase 5 but doesn't add a new phase. The work fits into existing Phase 5 plans:

| Phase 5 Plan | CLI Runtime Touch Point |
|---|---|
| 05-01 (Wizard flow) | Onboarding shows detected tools, wizard uses runtime strengths for proposals |
| 05-02 (Agent proposal engine) | Uses CLI_RUNTIME_REGISTRY strengths + cost_tier for agent-to-backend matching |
| 05-03 (Approval-to-execution) | Created agents get `preferred_backend` set from wizard selection |
| 05-05 (Token budget) | cost_tier informs budget enforcement per agent |

---

## Supported CLI Tools — Full Reference

### Claude Code
```bash
claude -p --output-format json --model sonnet "prompt"
# Returns: {"result": "...", "usage": {"input_tokens": N, "output_tokens": N}, "session_id": "..."}
# Cost control: --max-budget-usd 0.50
# Read-only: --permission-mode plan
# Structured: --json-schema '{"type":"object",...}'
```

### Codex CLI
```bash
codex exec --json --ephemeral --skip-git-repo-check -m gpt-5.4 "prompt"
# Returns: JSONL events — {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
# Sandbox: --sandbox workspace-write
# Auto-approve: --full-auto
# Save output: --output-last-message /tmp/result.txt
```

### Gemini CLI
```bash
gemini -p "prompt" -o text -y -m gemini-2-flash
# Returns: plain text (banners stripped by Porter)
# Auto-approve: -y (YOLO mode)
# Image input: -i /path/to/image.png
# Note: JSON output hangs in v0.31+ — use text mode
```

### Ollama
```bash
curl -s http://127.0.0.1:11434/api/generate -d '{"model":"qwen2.5-coder:1.5b","prompt":"...","stream":false}'
# Returns: {"response": "...", "total_duration": N, "eval_count": N}
# List models: GET /api/tags
# Pull model: POST /api/pull {"name": "model:tag"}
```

---

## Non-Goals

- **Porter API proxy** — Porter is not re-exposing LLM APIs. That's middleman behavior.
- **Key management** — Porter doesn't store or manage API keys for CLI tools. Each tool handles its own auth.
- **Model fine-tuning** — Out of scope. Porter uses models as-is.
- **CLI tool installation** — Porter detects tools, doesn't install them. Install hints are guidance only.

---

## Open Questions

1. **Should the wizard block if zero CLI tools are detected?** Or allow Ollama-only operation?
2. **Should agents be allowed to switch backends mid-task?** (e.g., start with Ollama for triage, escalate to Claude for deep analysis)
3. **How to handle CLI tool updates?** Porter probes on every boot — is version-aware routing needed?
4. **Multi-user deployments:** Each user brings their own CLI auth. How does Porter handle per-user backend availability on a shared instance?
