---
name: trend-forecaster
description: Detect, evaluate, and explain emerging market, product, consumer, regulatory, and cultural shifts using signal gathering, pattern synthesis, scenario framing, and implication mapping. Use when work involves horizon scanning, weak-signal analysis, category evolution, innovation planning, scenario development, foresight briefs, or separating durable shifts from hype. Do not use for timeless strategy advice that does not depend on change over time.
---

# trend-forecaster

Turn noisy change into decision-useful foresight.

This skill owns trend judgment: how to define the scan horizon, collect diverse signals, separate fad from structural shift, express uncertainty honestly, and translate patterns into business, product, and operating implications.

## Scope

Use this skill for:
- horizon scanning and trend briefs
- weak-signal collection and synthesis
- scenario planning and future-state framing
- category, market, and consumer-shift analysis
- innovation opportunity mapping
- early-warning watchlists and signal dashboards
- regulatory, technological, or cultural change tracking
- implications analysis for products, brands, GTM, or operations
- distinguishing hype cycles from durable adoption curves
- framing near-, mid-, and long-horizon bets

## Do not use this skill for

Do not use this skill for:
- static market analysis with no temporal or directional component
- precise financial forecasting that requires econometric modeling depth
- strategy recommendations detached from external signals and change drivers
- retrospective reporting where the main task is historical summary, not forward inference
- prediction theater presented as certainty when evidence is thin

## Routing rules

Route to **trend-forecaster** when the main challenge is deciding:
- what changes are emerging and which matter
- whether a signal cluster is real, premature, cyclical, or overhyped
- how a domain may evolve across multiple plausible futures
- what to monitor now to validate or kill a thesis later
- how to convert scanning into concrete bets, risks, and watchpoints

Do **not** route here just because the user says “future.”
If the task is really market sizing, core strategy, or research synthesis without a forward-looking frame, use the skill centered on that problem.

## Inputs to gather

Before forecasting, identify:
- domain, category, and exact question
- geography and regulatory context
- customer or audience segment
- forecast horizon: 3 months, 12 months, 3 years, etc.
- decision type: product roadmap, investment, positioning, operations, policy
- evidence sources available and evidence quality
- current baseline conditions and incumbent dynamics
- tolerance for uncertainty and downside risk
- leading indicators that would confirm or invalidate the thesis

If the time horizon or decision context is missing, say the forecast frame is underspecified.

## Output expectations

Return outputs such as:
- trend briefs with signals, drivers, implications, and watchpoints
- scenario sets with best/base/downside or alternative futures
- ranked opportunity maps by timing, confidence, and payoff
- signal trackers with catalysts and invalidation criteria
- executive summaries translating change into action now / next / later

Prefer decision-ready foresight over fashionable language.

## Working method

### 1. Define the forecast frame
Set the domain, geography, audience, time horizon, and decision to inform.
Without this, “trend analysis” collapses into generic speculation.

### 2. Gather diverse signal types
Look across:
- product launches and feature moves
- funding, M&A, and hiring patterns
- regulation and standards activity
- search behavior and audience interest
- creator, community, and practitioner chatter
- adoption behavior, pricing shifts, and workflow change
- macroeconomic and infrastructure drivers

Single-source “trend” work is usually weak.

### 3. Cluster signals into patterns
Group evidence into themes.
Distinguish:
- isolated novelty
- recurring weak signal
- accelerating pattern
- established shift
- saturated or commoditizing trend

### 4. Test for durability
Ask what mechanism makes the shift persist:
- economics
- regulation
- behavior change
- infrastructure maturity
- distribution advantage
- ecosystem lock-in

If the mechanism is vague, confidence should stay low.

### 5. Build scenarios, not one-line predictions
Describe plausible paths, catalysts, blockers, and failure modes.
Show how the future changes under different assumptions.

### 6. Translate foresight into decisions
End with action.
State what to do now, what to test next, what to monitor, and what would cause a thesis to be revised.

## Heuristics

Prefer:
- multiple signal classes
- explicit confidence levels
- time horizons tied to actual decisions
- named drivers and causal mechanisms
- scenarios with watchpoints and invalidation logic
- concise implication mapping for product, GTM, and operations

Avoid:
- declaring certainty from thin evidence
- confusing social chatter with market adoption
- calling every new thing a structural trend
- ignoring regional or regulatory differences
- trend decks full of vibes and no decisions
- recommendations with no trigger conditions

## Adjacent skill boundaries

- **trend-forecaster** owns directional change analysis over time
- **market-researcher** owns current-state market understanding and evidence collection
- **strategic-planner** owns strategic choices once the foresight frame is clear
- **competitive-intelligence** owns competitor moves when the center is rivalry, not broader change
- **technology-scout** may own technology landscape tracking; use this skill when the goal is forecast synthesis and implications

## Quick routing examples

Use **trend-forecaster** for:
- assessing whether AI shopping agents will materially reshape checkout behavior over 18 months
- turning creator-commerce weak signals into three plausible category trajectories
- separating durable climate-tech procurement shifts from short-lived PR theater
- building an early-warning watchlist for telecom automation trends

Do **not** use **trend-forecaster** for:
- a static TAM/SAM/SOM market model
- a current competitor teardown with no future-state framing
- generic innovation brainstorming detached from evidence

## Quality bar

A strong result should:
- define scope, horizon, and decision context clearly
- ground claims in observable signals rather than vibes
- distinguish hype, cyclical movement, and structural change
- express uncertainty, confidence, and invalidation explicitly
- convert foresight into prioritized actions and watchpoints
- help a decision-maker act before the trend is obvious to everyone else

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
