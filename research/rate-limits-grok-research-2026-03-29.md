# Rate Limit Research — Grok (2026-03-29)

## Key Findings

### Claude Code CLI
- No public usage API. JSONL files are best local method.
- Headers: `anthropic-ratelimit-*` prefix (not `x-ratelimit-*`)
- CLI doesn't expose headers to hooks/stdout
- 5-hour rolling window + weekly limits
- Pro: ~10-40 prompts/5h, Max 5x: ~50-200, Max 20x: ~200-800
- Limits are token/complexity-based, not fixed message counts
- Weekly has separate Opus bucket

### Codex CLI
- `~/.codex/state_5.sqlite` threads table is what CLI itself uses — confirmed reliable
- 5-hour window + weekly cap
- No x-ratelimit headers for subscription quotas
- Parse stdout for: "usage limit", "5-hour limit", "weekly limit"

### Gemini CLI
- 1000 req/day (free), 1500 (Pro), 2000 (Ultra)
- No weekly limits
- No local quota file
- Parse output for: "quota limit", "rate limiting detected"

### OpenClaw
- Pure proxy, passes through 429s from upstream
- No usage endpoints, no local tracking
- Parse for: "API rate limit reached"

### Detection Method
For CLI subprocesses: parse stdout/stderr for rate limit strings.
For HTTP adapters: parse response headers (anthropic-ratelimit-*, x-ratelimit-*).
