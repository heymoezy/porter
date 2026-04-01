# Pitfalls Research

**Domain:** RPG Gamification of AI Agents — Battle Arena, Competitive Ranking, Stat Systems, Productivity-Game Tension
**Researched:** 2026-03-29
**Confidence:** HIGH (grounded in: LLM judge bias research papers 2024-2025, Chatbot Arena vote-rigging paper ICML 2025, Elo manipulation literature, gamification failure analysis, Porter's specific VPS constraints)

This file is specific to the v4.0 Agent RPG System + Battle Arena milestone. It extends the existing PITFALLS.md covering v3.0 Bridge pitfalls, which remain relevant for dispatch and gateway integration.

---

## Critical Pitfalls

### Pitfall 1: LLM Judge Positional Bias Corrupts Battle Results

**What goes wrong:**
The battle judge receives two responses — Agent A's answer and Agent B's answer — in a fixed or predictable order. Research on LLM-as-a-Judge systems (ACL 2025, arxiv 2406.07791) shows position bias is not random chance: judges systematically favor the response presented first by 5-15% in pairwise comparisons. GPT-4 showed 40% inconsistency when answer order was swapped in the same comparison. This means the agent that draws "slot 1" wins more battles than their actual output quality deserves.

**Why it happens:**
Developers write the simplest judge prompt: "Here are two responses to [prompt]. Which is better?" with A always listed before B. This works in testing (low battle volume masks the bias) and fails at scale when users notice their agent always loses despite appearing to give better answers.

**How to avoid:**
- Always randomize which agent's response appears first in the judge prompt. Use a coin-flip at battle time, stored in the battle record so re-evaluation is reproducible.
- Run ensemble judging: 3 separate judge model calls with randomized positions each time. Take the majority vote. A 2-1 majority is the score; a 3-0 sweep is a dominant win.
- Never use the same model family to judge battles between agents running that same family (e.g., GPT-4o judging a battle where Agent A is running GPT-4o). Self-enhancement bias gives a 5-7% systematic boost (arxiv 2410.21819).
- Store `judge_model`, `position_a_agent`, `position_b_agent`, and all three individual scores in the battle record for auditability and bias detection.

**Warning signs:**
- Agents equipped with one specific model win >70% of their battles despite varying prompts and opponents
- Win rate correlates with battle slot assignment rather than skill
- User complaints that "my agent always loses even when the answer looks better"

**Phase to address:** Phase 9 (Battle Arena MVP) — the judge architecture must be designed before any battles run. Retrofitting randomization into an existing battle log is not possible without invalidating historical Elo ratings.

---

### Pitfall 2: Compute Runaway — Every Battle Is Real API Dollars

**What goes wrong:**
A single battle dispatches a prompt to two agents simultaneously plus three judge calls = 5 LLM API requests per battle. At $0.01-0.08 per request (depending on model tier), 100 battles/day = $5-40/day in judge costs alone before agent response costs. Free-tier users can trigger battles at no personal cost while the platform absorbs the bill. A user running automated battle scripts (or a tournament bracket of 16 agents = 60 battles) can spend $50 of platform compute in minutes.

On Porter's current 2 vCPU VPS, simultaneous battle execution also risks resource exhaustion: two long-form agent responses plus three judge calls = 5 concurrent API requests with streaming SSE connections.

**Why it happens:**
Battle costs are invisible in development (small volume, developer's own API keys). The per-battle cost feels trivial ("it's just 5 cents") until you have concurrent users or abuse. Rate limits are added reactively after the first billing shock.

**How to avoid:**
- Hard cap battles per tier per day, enforced at the API level before the first dispatch fires: Free=5, Pro=50, Enterprise=custom. Check the cap in the battle request handler before any LLM call.
- Implement a per-battle cost estimate before execution: calculate approximate token cost based on prompt length and selected agent models, display to user, require acknowledgment for battles over a configurable threshold.
- Use Ollama (local, $0) as the default judge model. Only upgrade to a paid judge for Pro/Enterprise tiers or when local judge scores fall below a confidence threshold.
- Queue battles rather than executing immediately: a simple `battle_queue` table with `status: pending|running|complete` prevents concurrent overload. Process one battle at a time per user.
- Monitor per-user battle spend with an in-memory accumulator; cut off at configurable daily limit.

**Warning signs:**
- No `battles_today` counter in the user's session or a rate-limit check before dispatch
- Tournament feature launches without a bracket-size cap
- Battle endpoint accepts requests without checking user's tier limits
- Cost per day exceeds 10x expected baseline (monitor `dispatch_logs` cost column)

**Phase to address:** Phase 9 (Battle Arena MVP) — rate limits and the battle queue must be built into the MVP, not added later. Phase 7 (Session Registry) should provide the infrastructure for per-user session cost tracking.

---

### Pitfall 3: Stale Meta — Claude Equipped Wins Everything

**What goes wrong:**
The design spec identifies this risk explicitly: if model choice (the Weapon slot) determines win rate more than prompt quality (Armor) or tool selection (Accessories), users discover the dominant strategy immediately. "Equip Claude Sonnet, use the stock 'You are a helpful assistant' prompt, win 80% of battles." Once this is common knowledge, the arena becomes a Claude advertisement and engagement collapses. Users with no access to premium models give up. The meta stagnates within weeks.

Chatbot Arena (LMSYS) already demonstrated this pattern at scale: top-performing models cluster, bottom of the leaderboard rarely changes, and the human voter base migrates toward testing only the top models. By 2025 the methodology was criticized as reflecting "who has the most fluent style" rather than actual utility.

**Why it happens:**
The design intends that Armor (system prompt) > Weapon (model), but this balance requires deliberate calibration and must be validated empirically before launch. If the judge evaluates "output quality" and the strongest model produces objectively better prose, the scoring naturally skews toward model power.

**How to avoid:**
- Before launch, run a calibration tournament: same Armor (identical system prompt) across all available models. If win rates correlate >0.8 with model benchmark scores, the judge is evaluating model power not build quality.
- Weight the scoring rubric toward compliance, format adherence, and task-specific criteria rather than general "quality." An agent that follows its system prompt perfectly but uses Ollama should beat an agent that ignores its system prompt but uses Claude.
- Introduce prompt-locked battles (a specific challenge mode): both agents receive the same system prompt override, neutralizing the Armor variable. This isolates Weapon + Accessories.
- Track `specialty_win_rates` per domain. If Claude agents win >80% of all domains, the meta is broken. This is a launch-blocker metric, not a post-launch discovery.
- Model rotation: periodically introduce battles where the Weapon slot is randomized (like Chatbot Arena's anonymous model testing) to help users discover whether their build quality actually matters.

**Warning signs:**
- Pre-launch calibration shows model win rate correlates strongly with model benchmark rank
- Beta testers report "I just equip Claude and never lose"
- Specialty leaderboards show the same top models across all domains

**Phase to address:** Phase 9 (Battle Arena MVP) — calibration testing before public battles. Phase 10 (Spectator + Tournaments) — separate tournament modes that control for model tier.

---

### Pitfall 4: Elo Rating Manipulation via Sandbagging and Tanking

**What goes wrong:**
Standard Elo (default 1200, symmetric win/loss deltas) has well-documented manipulation vectors. The ICML 2025 paper "Improving Your Model Ranking on Chatbot Arena by Vote Rigging" demonstrated that Elo rankings can be manipulated with only hundreds of strategic votes or battles. In the Porter context, the most likely attacks are:

1. **Sandbagging**: Deliberately losing battles to lower an agent's Elo, then selectively winning high-stakes matches when Elo is low (gains more points per win due to the Elo formula's upset bonus).
2. **Farming easy opponents**: Only entering battles against new agents (default 1200 Elo), winning predictably, padding the rating without facing real competition.
3. **Rating inflation via disconnects**: Abandoning a battle mid-execution (network error, timeout) leaves the opponent in a state where neither Elo is updated, preventing a legitimate win from being recorded.

**Why it happens:**
Elo was designed for chess — games where disconnection is obvious, sandbagging is visible to observers, and players cannot control opponent selection. In automated systems where users control battle initiation and timing, these assumptions break.

**How to avoid:**
- Minimum battle count before Elo is displayed: require 10+ completed battles before showing a public Elo score. Early-game Elo volatility is real but invisible while the rating is provisional.
- Battle completion is mandatory for Elo update: if either agent fails to return a response within the timeout window, the battle is marked `incomplete` and no Elo update occurs. A forfeiture system (3 incompletes = -50 Elo) prevents timeout-farming.
- Restrict opponent selection: matchmaking should prefer opponents within ±200 Elo. Free-tier users cannot manually cherry-pick opponents; matchmaking is automated.
- Separate domain Elo from global Elo: a Python specialist with 1800 domain Elo cannot inflate their global Elo by entering Creative Writing battles they will lose. Domain Elo and global Elo are calculated independently.
- Rate-limit battles per agent per hour (not just per user): 10 battles/agent/hour prevents rapid Elo grinding.

**Warning signs:**
- Top Elo agents have unusually high win rates against much lower-rated opponents (cherry-picking)
- Agents with high Elo have <10 battles (insufficient sample)
- Suspicious pattern: agent loses 20 consecutive battles, then wins 10 against low-rated opponents

**Phase to address:** Phase 9 (Battle Arena MVP) — matchmaking constraints must be in the MVP. Phase 10 (Tournaments) — tournament structures inherently prevent cherry-picking.

---

### Pitfall 5: The Toy Problem — Game Mechanics Displace Utility

**What goes wrong:**
Gartner's finding that 80% of workplace gamification projects fail because they "lack creativity and meaning" is not about missing leaderboards — it is about replacing the actual value proposition with point collection. For Porter specifically: if users start dispatching trivial tasks repeatedly to grind XP ("+10 per dispatch completed") rather than using agents for real work, the platform's utility metrics collapse while engagement metrics look fine. A user dispatching "say hello" 500 times to get their agent to 2-star is gaming the system, not using the product.

This is Goodhart's Law: "When a measure becomes a target, it ceases to be a good measure."

**Why it happens:**
XP and level-up animations feel compelling to build. They work in the demo. The failure mode is invisible until user behavior data reveals gaming patterns. Developers optimize for engagement metrics (session length, dispatch count) without distinguishing trivial dispatches from meaningful work.

**How to avoid:**
- XP values must be quality-gated, not activity-gated. The base "+10 per dispatch" should be the floor; the signal that matters is "+25 for positive feedback" and "+100 for battle win." Weight quality signals 3-5x over raw dispatch counts.
- Star progression gates should require quality thresholds, not just dispatch counts. The spec already has 85% reliability required for 3-star — extend this: 50-dispatch threshold for 2-star should also require `average_quality_score > 7.0` from the last 20 dispatches with feedback.
- Track dispatch quality in aggregate: if an agent's last 20 dispatches have <5% positive feedback rate, flag it in the admin dashboard as "potential grinding pattern."
- The Forge reveal animation and progression events should feel earned, not cheap. Cheap XP inflation (daily login bonus, "achievement unlocked for reading your agent card") trains users to see the game layer as trivial. Every progression event should represent real agent capability growth.
- Keep the game layer visually subordinate to the work layer. Character cards appear in an Armory/Forge section; the Projects view remains clean. Users should not need to think about Elo to get work done.

**Warning signs:**
- Average dispatch length falling over time (users sending shorter, lower-effort prompts)
- High dispatch count but near-zero positive feedback rate for some agents
- Users complaining that progression "feels fake" or is easy to game
- Session time increasing while project completion rate is flat or falling

**Phase to address:** Phase 4 (Stat Calculation Engine) — quality gates in XP calculation must be built at the data layer. Phase 8 (Forge Birth Animation) — visual hierarchy decisions that keep game below work.

---

### Pitfall 6: Immutable Dispatch Log Becomes a Performance Bottleneck

**What goes wrong:**
The spec correctly makes stats derive from an immutable `dispatch_log` (anti-gaming). But as dispatch_log grows — 500+ dispatches for a Legendary-tier agent, multiplied across dozens of agents and users — re-deriving all stats from raw logs on every character card render becomes a full-table-scan problem. A `SELECT avg(latency_ms) FROM dispatch_log WHERE agent_id = $1` over 10,000 rows is fine. The same query for SPD, EFF, REL, COMBO, and QTY across a roster of 50 agents on the Forge page is 250 table scans per page load.

Porter's 2 vCPU VPS with PostgreSQL cannot sustain this under any meaningful concurrent load.

**Why it happens:**
The stat derivation pattern is correct in principle and works perfectly with small datasets during development. The performance cliff appears at scale and is invisible until an active user has >200 dispatches per agent.

**How to avoid:**
- Use a materialized stat cache table: `agent_stat_snapshots` (agent_id, qty, spd, eff, rel, combo, level, xp, last_recalculated_at). Rebuild this table asynchronously on dispatch completion via the existing workflow/scheduler system.
- The character card API reads from `agent_stat_snapshots`, not from raw `dispatch_log`. The snapshot is at most 5 minutes stale — acceptable for a game display.
- Incremental stat updates: on each new dispatch, update the snapshot incrementally (rolling average) rather than full re-scan. `new_avg = (old_avg * n + new_value) / (n + 1)`.
- Index `dispatch_log` on `(agent_id, created_at)` minimally. Add `(agent_id, completed_at, quality_score)` as a composite index for quality stat queries.

**Warning signs:**
- Forge page load time exceeds 500ms when any user has >100 dispatches
- Character card endpoint takes longer per request as dispatch volume grows
- `pg_stat_activity` shows long-running `avg(latency_ms)` scans on dispatch_log

**Phase to address:** Phase 4 (Stat Calculation Engine) — the snapshot cache must be designed alongside the stat schema, not added when performance issues appear.

---

### Pitfall 7: .md File Anti-Gaming That Breaks Real Workflows

**What goes wrong:**
The spec states `.md files are DERIVED from DB state, regenerated on progression events, overwritten from DB on every progression event. No self-rating. Blind battle judging." This is the right anti-gaming approach. But it creates a real operational problem: Porter's existing Memory V2 system and agent dispatch pipeline already reads from `.md` files (SOUL.md, IDENTITY.md, SKILLS.md) as part of system prompt construction. If a file is mid-regeneration when a dispatch fires, the agent may receive a partial or empty system prompt. Or worse: a user manually edits SOUL.md with a genuine improvement (not gaming), and the next level-up event overwrites their edit with a DB-derived version that loses the improvement.

**Why it happens:**
The anti-gaming requirement and the memory injection pipeline were designed independently. The spec doesn't address the atomic write + concurrent read problem on these files.

**How to avoid:**
- Atomic writes: generate the new `.md` content to a temp file (`SOUL.md.tmp`), then rename atomically (`mv SOUL.md.tmp SOUL.md`). This prevents partial reads.
- Write a lock: before regeneration, write a sentinel (`SOUL.md.lock`) that the dispatch pipeline checks. If locked, use the cached last-known version from DB rather than the file.
- User edits to `.md` files should be synced BACK to the DB, not overwritten. Provide a `SOUL.md` editor in the Forge Workshop UI that writes to the DB field (`soul_override` on the agent template). The DB field is the source of truth; the file is a derived artifact.
- Version the `.md` files: track a `md_version` integer in the DB. If the file version doesn't match the DB version, regenerate. This prevents stale files from persisting after schema changes.

**Warning signs:**
- Agent system prompts appearing empty or truncated in dispatch logs
- User-edited SOUL.md content disappearing after a level-up
- Dispatch and level-up events happening within the same second on high-activity agents

**Phase to address:** Phase 2 (Forge Unification) — the `.md` file sync architecture must be resolved before Forge Workshop is built. Phase 4 (Stat Calculation Engine) — triggers that regenerate `.md` files must use atomic writes.

---

### Pitfall 8: Model Deprecation Orphans an Agent's "Weapon"

**What goes wrong:**
The spec lists this as an open question: "How do we handle model deprecation (agent's weapon disappears)?" This is not hypothetical — OpenAI deprecated gpt-4-0314 in September 2024, Anthropic deprecated claude-2.0 in November 2024. Agents built around a specific model version become unplayable when the model is removed from the gateway catalog. Their Elo history and stats are intact but their battles cannot execute. If the Weapon slot is empty, the agent has no model to respond with in a battle.

Worse: if stats were derived from dispatches on GPT-4-0314 and the user is forced to re-equip GPT-4o, the comparative stats are now invalid — the agent's historical SPD numbers reflected GPT-4-0314's latency, not GPT-4o's.

**Why it happens:**
Model versioning is a provider concern that bleeding into platform state. The gear system treats model choice as a simple string reference without lifecycle awareness.

**How to avoid:**
- Never store a raw model version string in the Weapon slot. Store a `model_alias` that maps to a current model via the gateway model catalog. `"claude-3-sonnet"` → resolves to current Sonnet version. The catalog owns the versioning.
- When a model is deprecated: mark it `status: deprecated` in the catalog. Agents using deprecated models are flagged in the Forge UI as "needs re-arming." Their existing stats and Elo are preserved and attributed to the `model_alias` lineage.
- Stat continuity: when a model is upgraded within an alias (e.g., Sonnet 3.5 → Sonnet 4), add a `model_transition_event` to the agent's history noting the version change. SPD stats before and after the transition are kept in separate cohorts for transparency.
- Provide a one-click "upgrade weapon" action that migrates the agent to the nearest equivalent current model with a confirmation prompt showing stat impact estimate.

**Warning signs:**
- Agents with raw model version strings (e.g., `gpt-4-0314`) rather than catalog aliases in their Weapon slot
- No `status` field on catalog model entries
- Battle execution failing silently because the Weapon model is unavailable

**Phase to address:** Phase 3 (Character Card + Gear UI) — gear slot display must resolve aliases. Phase 19 (Model Catalog) is already shipped — extend it with model alias and deprecation lifecycle.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single judge model call (no ensemble) | Faster battles, cheaper per-battle | Biased results, unfair Elo; users lose trust | MVP only if labeled "beta scoring" |
| Stats calculated live from dispatch_log | No extra table, simple code | Full table scans per page load; breaks at 200+ dispatches per agent | Never past MVP; Phase 4 must add snapshot cache |
| Global Elo only (no domain Elo) | Simpler schema | Stale meta is invisible; Python specialist unfairly ranked against creative writers | Acceptable for MVP; domain Elo in Phase 10 |
| Paid model as default judge | Best scoring quality | $0.05-0.10 per battle; 100 battles/day = $5-10/day judge cost alone | Never for free tier; use local Ollama judge for free tier |
| Raw model version in Weapon slot | Fastest implementation | Model deprecation orphans agents silently | Never; always use catalog aliases |
| XP awarded for any dispatch | Simple, encouraging | Users grind trivial tasks; stats inflate meaninglessly | Never; quality gate XP from Phase 4 |
| .md file direct write without lock | Simple, zero infrastructure | Partial reads corrupt agent system prompts mid-dispatch | Never; atomic writes are cheap |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Battle judge via Porter Bridge | Using same gateway as agent under test | Judge call must use a separate, designated judge gateway — never the same adapter the agent is running on |
| Elo formula | Using symmetric K-factor for all battles | Use K=32 for provisional (<10 battles), K=16 for established (10-30), K=8 for veteran (30+) — prevents early volatility |
| SSE streaming in spectator mode | Streaming both agents' full responses before judge scores | Stream token-by-token with agent A on left, agent B on right simultaneously; judge score arrives last |
| dispatch_log → stat derivation | Running stat recalculation synchronously on dispatch complete | Always async via the scheduler/workflow system; dispatch path must complete before recalculation starts |
| LLM judge prompt | Asking "which is better overall?" | Decompose into four scored dimensions (quality, speed, efficiency, style) each rated 1-10; prevents halo effect |
| Battle archive + replay | Storing only final scores | Store full prompts, both responses, judge reasoning, and individual scores per dimension for replays and dispute resolution |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Live stat derivation from dispatch_log | Forge page slow; worsens as usage grows | Materialized `agent_stat_snapshots` rebuilt async | >100 dispatches per agent on the page |
| Simultaneous battle + judge dispatch (5 concurrent requests) | VPS CPU spike; gateway rate limits hit | Battle queue: one battle processed at a time per user | >3 concurrent users triggering battles |
| Spectator mode SSE fan-out | SSE connections per spectator multiply server load | Limit spectators per active battle; consider server-sent events with a connection cap | >20 spectators on a single battle |
| Tournament bracket fan-out | 16-agent tournament = 60 battles = 300 LLM calls | Never auto-execute tournament brackets; queue all matches; run with configurable concurrency (1-2 at a time) | Any bracket larger than 4 agents on free tier |
| Elo recalculation on full history | Re-computing Elo from scratch on full battle history | Never recalculate from scratch; update incrementally; keep `current_elo` as a running value in agent_stats | >500 battles in system history |
| .md file regeneration on every dispatch | File writes + template rendering blocking dispatch path | Only regenerate on level-up, star-up, and gear change events — not every dispatch | Immediately if triggered on every dispatch |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| User can submit battle results manually | Fake wins, Elo inflation | Battle results are ONLY written by the server-side judge process; no client-submitted scores |
| Agent stats exposed via user-editable field | Stat gaming via API | All stat fields on agent_templates are READ-ONLY via user-facing API; only the internal stat calculation engine writes them |
| Battle endpoint has no user tier check | Free users run unlimited battles, billing shock | Enforce tier-based battle limits in the route handler before any LLM dispatch |
| Judge prompt reveals which agent is which | Self-enhancement bias at model level | Judge prompt uses Agent A / Agent B labels with randomized assignment; never includes agent names or equipped model names |
| Replay sharing exposes other users' agent configs | Gear loadout is competitive IP | Replay share links show responses and scores only; Armor (system prompt) and Accessories are masked in public replays |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing Elo rating before 10 battles | Meaningless number causes early frustration | Display "Provisional" badge until 10 battles; show battle count progress toward first official rating |
| Level-up animation on every tiny XP gain | Cheapens the progression; feels spammy | Reserve animation for star promotions and level milestones (10, 25, 50, 100); small XP gains are silent |
| Battle result "Agent B wins" with no explanation | Users cannot learn from losses | Always show judge breakdown by dimension; show specific feedback on what scored lower |
| Gear complexity front-loaded in Forge | New users overwhelmed; drop off before forging first agent | Default all gear slots to sensible defaults (Ollama weapon, stock system prompt, no accessories); expert mode unhides the depth |
| Rarity borders visible everywhere in the UI | Game aesthetic bleeds into work surfaces | Rarity borders and particle effects stay in Forge + Arena; Projects and People views use agent avatars only — no rarity chrome |
| Leaderboard shows only top 10 globally | Bottom 90% has no incentive to engage | Percentile bands ("You're in the top 30% of Fixer-class agents") keep most users engaged; global top-10 is a vanity metric |

---

## "Looks Done But Isn't" Checklist

- [ ] **Battle judge bias check:** Run 20 battles with positions swapped; win rates should differ by <10% — if >10%, position randomization is broken
- [ ] **Cost cap enforcement:** Attempt to trigger a 6th battle on a Free account — must return HTTP 429 with clear tier message, not 500
- [ ] **Stat snapshot cache:** With 200 dispatch_log rows for one agent, Forge page must load in <200ms — if slower, snapshot cache is not being used
- [ ] **Immutable stats:** Manually update a stat field via `UPDATE agent_templates SET qty = 99 WHERE id = $1` — the character card must show the DB-recalculated value within 5 minutes, not the manually set one
- [ ] **Elo update on battle complete:** After one battle completes, both agents' Elo in `agent_stats` must reflect the result — verify `updated_at` timestamp changed
- [ ] **Domain Elo separation (if shipped):** An agent with 1800 Python Elo entering a Creative Writing battle must not have their Python Elo affected by the result
- [ ] **.md atomic write:** Trigger a level-up while a dispatch is in-flight — the dispatch's system prompt must use either the old or new SOUL.md completely, never a partial version
- [ ] **Weapon slot model alias:** Delete a model from the catalog — agents using it must be flagged "needs re-arming" in Forge, not silently broken

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Judge bias discovered post-launch (historical Elo corrupted) | HIGH | Full Elo reset is the nuclear option; prefer: recalculate Elo for affected battles with corrected judge; flag affected users with "ratings recalibrated" notice |
| Compute runaway (billing shock) | MEDIUM | Retroactively apply tier caps; add emergency kill-switch (`BATTLES_ENABLED=false` env flag); refund or credit affected accounts |
| Stale meta (one model dominates) | MEDIUM | Introduce "prompt-locked" battle mode immediately (same system prompt for both agents); adjust judge scoring weights toward format compliance over prose quality |
| Stat gaming discovered (users inflating dispatch counts) | LOW | Retroactively apply quality gate to XP: dispatches with zero feedback count count for 2 XP not 10; send users a "stats recalculated" notification |
| Elo manipulation via sandbagging | LOW | Minimum 10 battles, automated opponent in valid Elo range, no cherry-picking — these constraints prevent most sandbagging before it starts |
| .md file corruption on concurrent write | LOW | Re-trigger regeneration from DB; files are always re-derivable; no data loss risk if DB is source of truth |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| LLM judge positional bias | Phase 9: Battle Arena MVP | Swap 20 battle position assignments; win rate delta must be <10% |
| Compute runaway | Phase 9: Battle Arena MVP | Attempt 6th battle on Free tier — must be blocked before dispatch fires |
| Stale meta (model dominance) | Phase 9: MVP calibration before launch | Pre-launch calibration tournament; Claude vs Ollama same-prompt test; win rate gap must be <30% |
| Elo sandbagging | Phase 9: Battle Arena MVP | Attempt cherry-pick opponent selection — matchmaking must reject ±200+ Elo mismatches |
| Toy problem (XP grinding) | Phase 4: Stat Calculation Engine | Dispatch 50 trivial 1-word prompts; confirm XP gain does not reach 2-star threshold |
| Stat snapshot performance | Phase 4: Stat Calculation Engine | Forge page load with 200-dispatch agent must be <200ms |
| .md file concurrent write | Phase 2: Forge Unification | Concurrent level-up + dispatch stress test; system prompt must never be empty |
| Model deprecation orphan | Phase 3: Character Card + Gear UI | Mark a test model as deprecated; agent Weapon slot must show "re-arm required" badge |
| Elo vote rigging (if community votes added) | Phase 10: Spectator + Tournaments | Community vote weight must be capped at 10% of final score; bot detection on voting patterns |

---

## Sources

- [Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge](https://arxiv.org/html/2410.02736v1) — 12 key biases identified; position bias, verbosity bias, self-enhancement quantified (HIGH confidence)
- [Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge](https://aclanthology.org/2025.ijcnlp-long.18/) — ACL 2025; position bias not random, varies significantly across judges and tasks (HIGH confidence)
- [Self-Preference Bias in LLM-as-a-Judge](https://arxiv.org/html/2410.21819v1) — 5-7% systematic self-enhancement boost; use separate models for generation and evaluation (HIGH confidence)
- [Improving Your Model Ranking on Chatbot Arena by Vote Rigging](https://arxiv.org/abs/2501.17858) — ICML 2025; Elo rankings manipulable with hundreds of strategic votes (HIGH confidence)
- [The AI industry is obsessed with Chatbot Arena, but it might not be the best benchmark](https://techcrunch.com/2024/09/05/the-ai-industry-is-obsessed-with-chatbot-arena-but-it-might-not-be-the-best-benchmark/) — sampling bias, selective disclosure, style bias in crowdsourced voting (MEDIUM confidence)
- [Elo rating systems and how to manipulate them](https://tonysheng.substack.com/p/elo-rating-systems-and-how-to-manipulate) — sandbagging, de-leveling, stats boosting mechanics (MEDIUM confidence)
- [Do 80% of all gamification projects fail? Gartner is right](https://centrical.com/resources/will-80-of-gamification-projects-fail/) — failure modes: lack of meaning, Goodhart's Law, activity metrics vs outcome metrics (HIGH confidence)
- [Productivity App Gamification That Doesn't Backfire](https://trophy.so/blog/productivity-app-gamification-doesnt-backfire) — common backfire patterns: rewarding hours over results, task splitting for points, metric gaming (MEDIUM confidence)
- [LLM API Pricing Comparison 2025](https://www.binadox.com/blog/llm-api-pricing-comparison-2025-complete-cost-analysis-guide/) — per-request costs $0.03-3.6 cents depending on model; GPT-4 500-word response ~$0.084 (HIGH confidence)
- [Smarter AI Cost Optimization With Guardrails That Scale](https://www.cloudzero.com/blog/ai-cost-guardrails/) — runaway loop can exceed monthly budget in hours without rate limits (MEDIUM confidence)
- [LLM-as-a-Judge: A 2026 Guide to Automated Model Assessment](https://labelyourdata.com/articles/llm-as-a-judge) — 93% of teams struggle with implementation; inconsistent scoring, cost, latency challenges (MEDIUM confidence)
- [Rating Roulette: Self-Inconsistency in LLM-As-A-Judge](https://aclanthology.org/2025.findings-emnlp.1361.pdf) — single-shot evaluations introduce inconsistencies; multiple iterations required (HIGH confidence)
- agent-rpg-design-v2.md — Grok review warnings: judge quality, compute cost, stale meta, toy problem, stats gaming (HIGH confidence — primary project spec)

---
*Pitfalls research for: Porter v4.0 — Agent RPG System + Battle Arena*
*Researched: 2026-03-29*
