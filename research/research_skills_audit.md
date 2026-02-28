# OpenClaw Skills Audit — Complete Inventory & Porter Mapping

**Audit date:** 2026-02-28
**Skills location:** `~/.openclaw/sandboxes/agent-main-f331f052/skills/`
**Total skills:** 50

---

## Table of Contents

1. [Complete Skill Inventory](#1-complete-skill-inventory)
2. [Category Classification](#2-category-classification)
3. [Porter Feature Mapping](#3-porter-feature-mapping)
4. [Automation & Agent Infrastructure](#4-automation--agent-infrastructure)
5. [Platform Compatibility Analysis](#5-platform-compatibility-analysis)
6. [Recommendations](#6-recommendations)

---

## 1. Complete Skill Inventory

### 1. 1password
- **Emoji:** lock
- **Description:** Set up and use 1Password CLI (`op`) for reading/injecting secrets
- **Requirements:** `op` binary
- **Install:** brew (`1password-cli`)
- **Files:** SKILL.md, references/

### 2. apple-notes
- **Emoji:** memo
- **Description:** Manage Apple Notes via `memo` CLI (create, view, edit, delete, search, export)
- **Requirements:** `memo` binary, macOS only
- **Install:** brew (`antoniorodr/memo/memo`)
- **Files:** SKILL.md

### 3. apple-reminders
- **Emoji:** alarm clock
- **Description:** Manage Apple Reminders via `remindctl` CLI (list, add, edit, complete, delete)
- **Requirements:** `remindctl` binary, macOS only
- **Install:** brew (`steipete/tap/remindctl`)
- **Files:** SKILL.md

### 4. bear-notes
- **Emoji:** bear
- **Description:** Create, search, manage Bear notes via `grizzly` CLI
- **Requirements:** `grizzly` binary, macOS only (Bear app)
- **Install:** go module
- **Files:** SKILL.md

### 5. blogwatcher
- **Emoji:** newspaper
- **Description:** Monitor blogs and RSS/Atom feeds for updates
- **Requirements:** `blogwatcher` binary
- **Install:** go module
- **Files:** SKILL.md

### 6. blucli
- **Emoji:** blueberry
- **Description:** BluOS CLI for Bluesound/NAD player control (discovery, playback, grouping, volume)
- **Requirements:** `blu` binary
- **Install:** go module
- **Files:** SKILL.md

### 7. bluebubbles
- **Emoji:** bubbles
- **Description:** iMessage integration via BlueBubbles; send/react/edit/unsend messages
- **Requirements:** config `channels.bluebubbles`
- **Install:** config-based
- **Files:** SKILL.md

### 8. camsnap
- **Emoji:** camera
- **Description:** Capture frames/clips from RTSP/ONVIF cameras
- **Requirements:** `camsnap` binary + `ffmpeg`
- **Install:** brew (`steipete/tap/camsnap`)
- **Files:** SKILL.md

### 9. clawhub
- **Emoji:** (none)
- **Description:** ClawHub CLI for searching, installing, updating, and publishing agent skills
- **Requirements:** `clawhub` binary
- **Install:** npm (`clawhub`)
- **Files:** SKILL.md

### 10. coding-agent
- **Emoji:** puzzle
- **Description:** Delegate coding tasks to Codex, Claude Code, or Pi agents via background processes
- **Requirements:** any of `claude`, `codex`, `opencode`, `pi`
- **Install:** various
- **Files:** SKILL.md

### 11. discord
- **Emoji:** game controller
- **Description:** Discord messaging (send/react/edit/delete/poll/thread/search) via message tool
- **Requirements:** config `channels.discord.token`
- **Install:** config-based
- **Files:** SKILL.md

### 12. eightctl
- **Emoji:** control knobs
- **Description:** Control Eight Sleep pods (status, temperature, alarms, schedules)
- **Requirements:** `eightctl` binary
- **Install:** go module
- **Files:** SKILL.md

### 13. gemini
- **Emoji:** Gemini
- **Description:** Gemini CLI for one-shot Q&A, summaries, and generation
- **Requirements:** `gemini` binary
- **Install:** brew (`gemini-cli`)
- **Files:** SKILL.md

### 14. gh-issues
- **Emoji:** (none)
- **Description:** Fetch GitHub issues, spawn sub-agents to implement fixes and open PRs, monitor PR reviews
- **Requirements:** `curl`, `git`, `gh` binaries + `GH_TOKEN`
- **Install:** pre-installed tools
- **User-invocable:** yes (`/gh-issues`)
- **Files:** SKILL.md

### 15. gifgrep
- **Emoji:** magnet
- **Description:** Search GIF providers (Tenor/Giphy), download, extract stills/sheets
- **Requirements:** `gifgrep` binary
- **Install:** brew or go module
- **Files:** SKILL.md

### 16. github
- **Emoji:** octopus
- **Description:** GitHub operations via `gh` CLI (issues, PRs, CI runs, code review, API queries)
- **Requirements:** `gh` binary
- **Install:** brew or apt
- **Files:** SKILL.md

### 17. gog
- **Emoji:** game controller
- **Description:** Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, Docs
- **Requirements:** `gog` binary + OAuth
- **Install:** brew (`steipete/tap/gogcli`)
- **Files:** SKILL.md

### 18. goplaces
- **Emoji:** pin
- **Description:** Query Google Places API (New) for text search, place details, reviews
- **Requirements:** `goplaces` binary + `GOOGLE_PLACES_API_KEY`
- **Install:** brew
- **Files:** SKILL.md

### 19. healthcheck
- **Emoji:** (none)
- **Description:** Host security hardening and risk-tolerance configuration for OpenClaw deployments
- **Requirements:** (none specified — uses OS commands)
- **Install:** built-in
- **Files:** SKILL.md

### 20. himalaya
- **Emoji:** envelope
- **Description:** CLI email client via IMAP/SMTP — list, read, write, reply, forward, search emails
- **Requirements:** `himalaya` binary
- **Install:** brew
- **Files:** SKILL.md, references/

### 21. imsg
- **Emoji:** incoming envelope
- **Description:** iMessage/SMS CLI for listing chats, history, sending via Messages.app
- **Requirements:** `imsg` binary, macOS only
- **Install:** brew (`steipete/tap/imsg`)
- **Files:** SKILL.md

### 22. mcporter
- **Emoji:** package
- **Description:** MCP server/tool management CLI — list, configure, auth, call MCP tools
- **Requirements:** `mcporter` binary
- **Install:** npm (`mcporter`)
- **Files:** SKILL.md

### 23. model-usage
- **Emoji:** chart
- **Description:** CodexBar CLI local cost/usage summaries per model (Codex or Claude)
- **Requirements:** `codexbar` binary, macOS only
- **Install:** brew cask
- **Files:** SKILL.md, scripts/

### 24. nano-banana-pro
- **Emoji:** banana
- **Description:** Generate or edit images via Gemini 3 Pro Image
- **Requirements:** `uv` binary + `GEMINI_API_KEY`
- **Install:** brew (`uv`)
- **Files:** SKILL.md, scripts/

### 25. nano-pdf
- **Emoji:** page
- **Description:** Edit PDFs with natural-language instructions
- **Requirements:** `nano-pdf` binary
- **Install:** uv package
- **Files:** SKILL.md

### 26. notion
- **Emoji:** memo
- **Description:** Notion API for creating/managing pages, databases, and blocks
- **Requirements:** `NOTION_API_KEY` env var
- **Install:** API key only
- **Files:** SKILL.md

### 27. obsidian
- **Emoji:** gem
- **Description:** Work with Obsidian vaults (plain Markdown notes) and automate via obsidian-cli
- **Requirements:** `obsidian-cli` binary, macOS (Obsidian desktop)
- **Install:** brew
- **Files:** SKILL.md

### 28. openai-image-gen
- **Emoji:** framed picture
- **Description:** Batch-generate images via OpenAI Images API with gallery output
- **Requirements:** `python3` + `OPENAI_API_KEY`
- **Install:** brew (python)
- **Files:** SKILL.md, scripts/

### 29. openai-whisper
- **Emoji:** microphone
- **Description:** Local speech-to-text with Whisper CLI (no API key)
- **Requirements:** `whisper` binary
- **Install:** brew (`openai-whisper`)
- **Files:** SKILL.md

### 30. openai-whisper-api
- **Emoji:** cloud
- **Description:** Transcribe audio via OpenAI Audio Transcriptions API
- **Requirements:** `curl` + `OPENAI_API_KEY`
- **Install:** curl (pre-installed)
- **Files:** SKILL.md, scripts/

### 31. openhue
- **Emoji:** light bulb
- **Description:** Control Philips Hue lights and scenes via OpenHue CLI
- **Requirements:** `openhue` binary + Hue Bridge on LAN
- **Install:** brew
- **Files:** SKILL.md

### 32. oracle
- **Emoji:** evil eye
- **Description:** Bundle prompt + files for one-shot requests to other models (GPT-5.2 Pro etc.)
- **Requirements:** `oracle` binary
- **Install:** npm (`@steipete/oracle`)
- **Files:** SKILL.md

### 33. ordercli
- **Emoji:** scooter
- **Description:** Foodora order history and active order status (Deliveroo WIP)
- **Requirements:** `ordercli` binary
- **Install:** brew or go module
- **Files:** SKILL.md

### 34. peekaboo
- **Emoji:** eyes
- **Description:** Full macOS UI automation — capture, inspect, click, type, app/window management
- **Requirements:** `peekaboo` binary, macOS only
- **Install:** brew (`steipete/tap/peekaboo`)
- **Files:** SKILL.md

### 35. sag
- **Emoji:** speaking head
- **Description:** ElevenLabs text-to-speech with local playback
- **Requirements:** `sag` binary + `ELEVENLABS_API_KEY`
- **Install:** brew
- **Files:** SKILL.md

### 36. session-logs
- **Emoji:** scroll
- **Description:** Search and analyze OpenClaw session logs (older/parent conversations)
- **Requirements:** `jq` + `rg` binaries
- **Install:** pre-installed
- **Files:** SKILL.md

### 37. sherpa-onnx-tts
- **Emoji:** speaking head
- **Description:** Local text-to-speech via sherpa-onnx (offline, no cloud)
- **Requirements:** `SHERPA_ONNX_RUNTIME_DIR` + `SHERPA_ONNX_MODEL_DIR` env vars
- **Install:** download runtime + model
- **Platform:** macOS, Linux, Windows
- **Files:** SKILL.md, bin/, scripts/

### 38. skill-creator
- **Emoji:** (none)
- **Description:** Create or update AgentSkills — design, structure, package skills
- **Requirements:** (none specified)
- **Install:** built-in
- **Files:** SKILL.md, scripts/, references/

### 39. slack
- **Emoji:** speech bubble
- **Description:** Slack operations — react, send/edit/delete messages, pins, member info
- **Requirements:** config `channels.slack`
- **Install:** config-based
- **Files:** SKILL.md

### 40. songsee
- **Emoji:** wave
- **Description:** Generate spectrograms and feature-panel visualizations from audio
- **Requirements:** `songsee` binary
- **Install:** brew
- **Files:** SKILL.md

### 41. sonoscli
- **Emoji:** speaker
- **Description:** Control Sonos speakers (discover, status, play, volume, group)
- **Requirements:** `sonos` binary
- **Install:** go module
- **Files:** SKILL.md

### 42. spotify-player
- **Emoji:** music note
- **Description:** Terminal Spotify playback/search via spogo or spotify_player
- **Requirements:** `spogo` or `spotify_player` binary + Spotify Premium
- **Install:** brew
- **Files:** SKILL.md

### 43. summarize
- **Emoji:** receipt
- **Description:** Summarize/extract text from URLs, podcasts, YouTube, local files
- **Requirements:** `summarize` binary
- **Install:** brew
- **Files:** SKILL.md

### 44. things-mac
- **Emoji:** check mark
- **Description:** Manage Things 3 tasks via CLI (add/update/search projects and todos)
- **Requirements:** `things` binary, macOS only
- **Install:** go module
- **Files:** SKILL.md

### 45. tmux
- **Emoji:** thread
- **Description:** Remote-control tmux sessions — send keystrokes, scrape pane output
- **Requirements:** `tmux` binary
- **Platform:** macOS, Linux
- **Install:** pre-installed
- **Files:** SKILL.md

### 46. trello
- **Emoji:** clipboard
- **Description:** Manage Trello boards, lists, and cards via REST API
- **Requirements:** `jq` + `TRELLO_API_KEY` + `TRELLO_TOKEN`
- **Install:** API keys only
- **Files:** SKILL.md

### 47. video-frames
- **Emoji:** film frames
- **Description:** Extract frames or short clips from videos using ffmpeg
- **Requirements:** `ffmpeg` binary
- **Install:** brew
- **Files:** SKILL.md, scripts/

### 48. voice-call
- **Emoji:** telephone
- **Description:** Start voice calls via OpenClaw voice-call plugin (Twilio/Telnyx/Plivo/mock)
- **Requirements:** config `plugins.entries.voice-call.enabled`
- **Install:** plugin config
- **Files:** SKILL.md

### 49. wacli
- **Emoji:** phone
- **Description:** WhatsApp messaging — send messages, search/sync history via wacli CLI
- **Requirements:** `wacli` binary
- **Install:** brew or go module
- **Files:** SKILL.md

### 50. weather
- **Emoji:** sun with clouds
- **Description:** Current weather and forecasts via wttr.in or Open-Meteo (no API key needed)
- **Requirements:** `curl` binary
- **Install:** pre-installed
- **Files:** SKILL.md

---

## 2. Category Classification

### Communication (8 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **discord** | Discord messaging (send/react/edit/delete/poll/thread) | Cross-platform |
| 2 | **slack** | Slack messaging (react/send/edit/delete/pin) | Cross-platform |
| 3 | **himalaya** | Email via IMAP/SMTP (list/read/write/reply/forward) | Cross-platform |
| 4 | **bluebubbles** | iMessage via BlueBubbles gateway | macOS |
| 5 | **imsg** | iMessage/SMS via Messages.app CLI | macOS |
| 6 | **wacli** | WhatsApp messaging and history | Cross-platform |
| 7 | **voice-call** | Voice calls via Twilio/Telnyx/Plivo | Cross-platform |
| 8 | **gog** (Gmail part) | Gmail send/search/drafts | Cross-platform |

### Productivity (9 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **gog** | Google Workspace (Gmail, Calendar, Drive, Contacts, Sheets, Docs) | Cross-platform |
| 2 | **notion** | Notion pages, databases, blocks via API | Cross-platform |
| 3 | **trello** | Trello boards, lists, cards via REST API | Cross-platform |
| 4 | **obsidian** | Obsidian vault management via CLI | macOS |
| 5 | **apple-notes** | Apple Notes management via memo CLI | macOS |
| 6 | **bear-notes** | Bear notes management via grizzly CLI | macOS |
| 7 | **apple-reminders** | Apple Reminders management via remindctl | macOS |
| 8 | **things-mac** | Things 3 task management via CLI | macOS |
| 9 | **1password** | 1Password CLI for secrets management | Cross-platform |

### Developer (5 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **github** | GitHub CLI for issues, PRs, CI, API queries | Cross-platform |
| 2 | **gh-issues** | Auto-fix GitHub issues with parallel sub-agents + PR creation | Cross-platform |
| 3 | **coding-agent** | Delegate coding to Codex/Claude Code/Pi background agents | Cross-platform |
| 4 | **mcporter** | MCP server/tool management and calling | Cross-platform |
| 5 | **tmux** | tmux session control for interactive CLIs | macOS/Linux |

### AI/ML (6 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **gemini** | Gemini CLI for one-shot Q&A and generation | Cross-platform |
| 2 | **oracle** | Bundle prompt+files for one-shot model queries (GPT-5.2 Pro) | Cross-platform |
| 3 | **openai-image-gen** | Batch image generation via OpenAI Images API | Cross-platform |
| 4 | **nano-banana-pro** | Image generation/editing via Gemini 3 Pro Image | Cross-platform |
| 5 | **openai-whisper** | Local speech-to-text (no API key) | Cross-platform |
| 6 | **openai-whisper-api** | Cloud speech-to-text via OpenAI API | Cross-platform |

### Data & Content (5 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **summarize** | Summarize URLs, podcasts, YouTube, local files | Cross-platform |
| 2 | **blogwatcher** | Monitor blogs and RSS/Atom feeds | Cross-platform |
| 3 | **nano-pdf** | Edit PDFs with natural language | Cross-platform |
| 4 | **gifgrep** | Search/download GIFs from Tenor/Giphy | Cross-platform |
| 5 | **goplaces** | Google Places API search and details | Cross-platform |

### System & Infrastructure (6 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **healthcheck** | Host security hardening and audit | Cross-platform |
| 2 | **session-logs** | Search/analyze OpenClaw session history | Cross-platform |
| 3 | **model-usage** | Per-model cost/usage tracking via CodexBar | macOS |
| 4 | **skill-creator** | Create and package new skills | Cross-platform |
| 5 | **clawhub** | Skill marketplace (search/install/publish) | Cross-platform |
| 6 | **video-frames** | Extract frames from video via ffmpeg | Cross-platform |

### Media & Audio (5 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **sag** | ElevenLabs TTS with local playback | Cross-platform |
| 2 | **sherpa-onnx-tts** | Local offline TTS via sherpa-onnx | Cross-platform |
| 3 | **songsee** | Audio spectrogram/feature visualization | Cross-platform |
| 4 | **spotify-player** | Spotify playback/search | Cross-platform |
| 5 | **sonoscli** | Sonos speaker control | Cross-platform |

### Smart Home & IoT (4 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **openhue** | Philips Hue light/scene control | Cross-platform (LAN) |
| 2 | **camsnap** | RTSP/ONVIF camera capture | Cross-platform |
| 3 | **blucli** | BluOS/Bluesound player control | Cross-platform |
| 4 | **eightctl** | Eight Sleep pod control | Cross-platform |

### Lifestyle (2 skills)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **ordercli** | Foodora order tracking/reorder | Cross-platform |
| 2 | **weather** | Weather forecasts via wttr.in | Cross-platform |

### UI Automation (1 skill)
| # | Skill | Description | Platform |
|---|-------|-------------|----------|
| 1 | **peekaboo** | Full macOS UI automation (capture/click/type/window mgmt) | macOS |

---

## 3. Porter Feature Mapping

### CHAT ENGINE (User talks to AI through Porter)

**Directly powerable:**
| Skill | Role | Notes |
|-------|------|-------|
| **gemini** | Alternative AI backend | One-shot Q&A; can be a fallback/secondary model |
| **oracle** | Deep research queries | Bundle files + prompt for GPT-5.2 Pro "long think" tasks |
| **coding-agent** | Code task delegation | Spawn Codex/Claude/Pi for coding tasks from within Porter |
| **summarize** | Content processing | User pastes URL -> Porter summarizes via this skill |
| **openai-whisper** / **openai-whisper-api** | Voice input | User uploads audio -> transcribe -> feed to chat |
| **sag** / **sherpa-onnx-tts** | Voice output | Generate spoken responses from chat |

**Architecture note:** Porter's chat engine would route through OpenClaw, which has all these skills. Porter does not need to call skills directly -- it proxies via OpenClaw gateway. The chat engine should support:
1. Text input -> OpenClaw -> text response
2. Audio upload -> whisper transcription -> OpenClaw -> text/audio response
3. URL input -> summarize -> user gets summary
4. File upload -> coding-agent or oracle for analysis

### MARKETING Automation (Reddit posting, content creation)

**Directly powerable:**
| Skill | Role | Notes |
|-------|------|-------|
| **gog** (Gmail/Docs/Sheets) | Email campaigns, content drafting | Send marketing emails, manage contact sheets |
| **discord** | Community engagement | Post announcements, manage server |
| **slack** | Team coordination | Internal marketing comms |
| **openai-image-gen** | Marketing visuals | Generate social media images, thumbnails |
| **nano-banana-pro** | Image editing | Edit/create images via Gemini |
| **summarize** | Competitor monitoring | Summarize competitor blog posts/articles |
| **blogwatcher** | Content monitoring | Track industry blogs/RSS for trends |
| **gifgrep** | Social media content | Find reaction GIFs for social posts |
| **nano-pdf** | Marketing collateral | Edit PDF brochures, one-pagers |

**Not yet available but needed:**
- Reddit posting skill (does not exist)
- Twitter/X posting skill (does not exist)
- LinkedIn posting skill (does not exist)
- SEO analysis skill (does not exist)

**Gap:** No social media posting skills exist in the current 50. Marketing automation for Porter would need custom skills for Reddit, Twitter/X, LinkedIn. The `skill-creator` skill can be used to build these.

### ADMIN Capabilities (system monitoring, user management)

**Directly powerable:**
| Skill | Role | Notes |
|-------|------|-------|
| **healthcheck** | Security audit | Host hardening, firewall checks, security posture |
| **session-logs** | Conversation audit | Search/analyze past OpenClaw sessions |
| **model-usage** | Cost monitoring | Track per-model API costs |
| **tmux** | Process monitoring | Check on background processes, worker sessions |
| **github** | Deployment management | Check CI/CD status, PR reviews |
| **1password** | Secrets management | Inject/rotate secrets securely |

**Architecture note:** Porter's admin panel can surface healthcheck reports, model usage stats, and session analytics. The admin should periodically trigger healthcheck audits and display results in a dashboard widget.

### HELP System (documentation, user guidance)

**Directly powerable:**
| Skill | Role | Notes |
|-------|------|-------|
| **summarize** | Documentation summarization | User asks "what does X do?" -> summarize docs |
| **skill-creator** | Skill documentation | Understand skill anatomy for help content |
| **clawhub** | Skill discovery | Search for new capabilities the user might need |
| **gemini** | Q&A fallback | Answer questions about Porter features |
| **oracle** | Deep documentation queries | Complex "how to" questions with file context |
| **weather** | Quick utility | Immediate-value demo for help walkthroughs |

**Architecture note:** Porter's help system should:
1. Index all installed skill descriptions as searchable help topics
2. Use summarize to process user-shared documentation URLs
3. Use gemini/oracle for contextual Q&A about Porter capabilities

### WORKFLOW Automation (connecting external services)

**Directly powerable:**
| Skill | Role | Notes |
|-------|------|-------|
| **gh-issues** | Automated GitHub issue fixing | Spawn sub-agents to auto-fix issues + open PRs |
| **coding-agent** | Automated code tasks | Background coding with Codex/Claude/Pi |
| **gog** | Google Workspace automation | Auto-calendar events, email responses, sheet updates |
| **notion** | Project tracking | Auto-update Notion databases from Porter events |
| **trello** | Task automation | Move cards, create tasks from Porter triggers |
| **slack** | Notifications | Auto-notify team channels on events |
| **discord** | Notifications | Auto-post to Discord on events |
| **himalaya** | Email automation | Auto-reply, auto-forward, email workflows |
| **blogwatcher** | Content monitoring | Alert when watched blogs have new posts |
| **camsnap** | Security automation | Motion-triggered camera captures |
| **voice-call** | Alerts | Auto-call on critical events |
| **wacli** | WhatsApp alerts | Send WhatsApp notifications |

**Workflow composition examples:**
1. "When a GitHub issue is labeled 'bug', auto-spawn coding-agent to fix it, open PR, notify Slack"
2. "Every morning at 9am, check blogwatcher for new posts, summarize them, email digest via gog"
3. "When Porter detects a new file upload, run healthcheck on it, notify Discord"
4. "When a Notion task is marked 'done', update Trello board and send WhatsApp confirmation"

### UNUSED / IRRELEVANT to Porter

| Skill | Reason |
|-------|--------|
| **apple-notes** | macOS only; Porter runs on Linux VPS |
| **apple-reminders** | macOS only |
| **bear-notes** | macOS only; Bear app required |
| **things-mac** | macOS only; Things 3 required |
| **obsidian** | macOS only (obsidian-cli); could work on Linux with direct file access |
| **imsg** | macOS only; Messages.app required |
| **bluebubbles** | Requires BlueBubbles gateway server (macOS) |
| **peekaboo** | macOS UI automation; irrelevant to headless VPS |
| **model-usage** | macOS only; CodexBar not available on Linux |
| **blucli** | Smart home; requires BluOS devices on LAN |
| **eightctl** | Smart home; Eight Sleep pod — niche |
| **openhue** | Smart home; Hue Bridge on LAN — niche |
| **sonoscli** | Smart home; Sonos on LAN — niche |
| **spotify-player** | Media; requires Spotify Premium + local playback |
| **songsee** | Audio visualization; niche use case |
| **ordercli** | Food delivery tracking; personal lifestyle |

**Note:** "Irrelevant to Porter" means these skills cannot be usefully integrated into Porter's feature set on its Linux VPS deployment. They remain valid OpenClaw skills for macOS users.

---

## 4. Automation & Agent Infrastructure

### Cron Jobs (`~/.openclaw/cron/jobs.json`)
```json
{
  "version": 1,
  "jobs": []
}
```
**Status:** Empty. No automated jobs configured. Infrastructure exists but is unused.

**Recommendations for Porter:**
- Schedule periodic `healthcheck` audits
- Schedule `blogwatcher` scans for content monitoring
- Schedule `model-usage` cost reports (if macOS)
- Schedule `gh-issues --cron` for automated issue fixing

### Agents (`~/.openclaw/agents/`)
```
~/.openclaw/agents/
  main/
    agent/
      models.json       — model configuration
      auth.json          — authentication
      auth-profiles.json — auth profiles
    sessions/
      sessions.json      — session index
      *.jsonl             — 10+ active session transcripts
      *.jsonl.reset.*     — 6 reset sessions
      *.jsonl.deleted.*   — 3 deleted sessions
```
**Status:** One agent (`main`) with ~13 active sessions, 6 reset, 3 deleted. This is the primary OpenClaw agent that Porter connects to.

### Workspace (`~/.openclaw/workspace/`)
**Contents (significant files):**
- `AGENTS.md` — Agent identity and roles documentation
- `BOOTSTRAP.md` — Bootstrap procedures
- `HEARTBEAT.md` — Heartbeat/liveness tracking
- `IDENTITY.md` — Agent identity configuration
- `MEMORY.md` — Long-term memory (user preferences, project context)
- `SOUL.md` — Agent personality/soul prompt
- `TOOLS.md` — Available tools documentation
- `USER.md` — User profile
- `memory/` — Daily memory files (2026-02-23 through 2026-02-27)
- `DFSA/` — DFSA interview preparation files
- `bitcoin-yield/` — Bitcoin Yield project files
- `porter/` — Porter-related workspace files
- `projects/` — Project workspace files
- `node_modules/` — npm dependencies (for script execution)
- Various JS scripts for document rendering

**Key insight from MEMORY.md:**
- User (Moe) prefers Claude for implementation, OpenClaw for orchestration/QA
- Porter architecture rule enforced: no hardcoded paths
- Trust UX requirement: never show incomplete features as working
- Active context includes DFSA interview prep and Porter development

---

## 5. Platform Compatibility Analysis

### Linux VPS Compatible (Porter's environment)
These skills work on the current Linux VPS:

**Ready to use (dependencies likely available):**
- weather (curl only)
- github (gh installed)
- tmux (pre-installed)
- session-logs (jq + rg)
- coding-agent (claude available)
- healthcheck (OS commands)
- summarize (if installed)
- blogwatcher (if Go available)

**Need installation:**
- himalaya, discord, slack, notion, trello (config/API keys only)
- gog (needs brew/binary)
- gemini (needs binary)
- openai-whisper-api (curl + API key only)
- nano-pdf, nano-banana-pro (need uv/python)
- video-frames (needs ffmpeg)
- sherpa-onnx-tts (has Linux x64 download)
- wacli (needs binary)
- gh-issues (curl + git + gh — likely available)

### macOS Only (8 skills)
apple-notes, apple-reminders, bear-notes, things-mac, obsidian, imsg, peekaboo, model-usage

### Requires Local Network (4 skills)
openhue, blucli, sonoscli, camsnap

---

## 6. Recommendations

### High-Priority Skills for Porter Integration

1. **summarize** — Immediate value for Porter's chat engine. User drops a URL -> gets summary.
2. **github** + **gh-issues** — Porter already has a Projects tab; deeper GitHub integration adds real workflow value.
3. **himalaya** — Email from Porter. Read/send/search email without leaving the file manager.
4. **gog** — Google Workspace integration. Calendar, Drive, Sheets accessible from Porter.
5. **notion** / **trello** — Task/project management directly from Porter's Projects tab.
6. **healthcheck** — Admin dashboard showing security posture.
7. **weather** — Zero-dependency quick utility; good for demo/onboarding.

### Missing Skills That Porter Needs
1. **Reddit posting** — No skill exists. Need `skill-creator` to build one.
2. **Twitter/X posting** — No skill exists.
3. **LinkedIn posting** — No skill exists.
4. **Web scraping** — `summarize` covers read-only; no skill for structured data extraction.
5. **Database** — No SQL/database management skill.
6. **Docker/container** — No container management skill.

### Skill CRUD for Porter Workflows Tab
Current inventory supports:
- **50 installed skills** to browse
- **clawhub** for searching/installing new skills from marketplace
- **skill-creator** for building custom skills
- Missing: uninstall mechanism, skill enable/disable toggle, per-skill configuration UI

### Cron/Automation Recommendations
The cron infrastructure exists but is empty. Recommended initial automations:
1. Daily `healthcheck` security audit
2. Hourly `blogwatcher` scan (once blogs are added)
3. Daily `gh-issues --cron` for auto-fixing (once repos are configured)
4. Weekly `model-usage` cost report email via `himalaya`

---

## Summary Statistics

| Category | Count | Linux-compatible | macOS-only |
|----------|-------|-----------------|------------|
| Communication | 8 | 6 | 2 |
| Productivity | 9 | 4 | 5 |
| Developer | 5 | 5 | 0 |
| AI/ML | 6 | 6 | 0 |
| Data & Content | 5 | 5 | 0 |
| System & Infra | 6 | 5 | 1 |
| Media & Audio | 5 | 3 | 2 |
| Smart Home/IoT | 4 | 0 | 4* |
| Lifestyle | 2 | 2 | 0 |
| UI Automation | 1 | 0 | 1 |
| **Total** | **50** | **36** | **14** |

*Smart Home skills are cross-platform but require LAN access to devices, making them irrelevant for a remote VPS.

**Porter-relevant skills:** ~30 of 50 (60%) can meaningfully power Porter features on the current Linux VPS.
**Key gaps:** Social media posting (Reddit/Twitter/LinkedIn), structured web scraping, database management, container orchestration.
