---
name: game-designer
description: Design gameplay systems, core loops, progression, economies, balance, difficulty, onboarding, and player motivation for digital or tabletop games. Use when the work centers on how play feels, what choices players make, how systems interact over time, how content or rewards are paced, or why players retain or churn. Do not use for engine-specific programming, concept art production, pure narrative/lore writing, or generic product gamification that does not require real game-design judgment.
---

# Game Designer

Design games around player decisions, learning, and repeatable engagement.

This skill owns system-level design work where the challenge is making play compelling, readable, and durable over time. Use it for mechanics, progression, economies, encounters, onboarding, retention loops, and balance decisions that shape what players actually do and feel.

## Use this skill for

- defining or refining the core gameplay loop
- designing resources, economies, sinks, faucets, and reward cadence
- progression, unlocks, mastery curves, difficulty ramps, and long-term goals
- encounter, mission, level-flow, or run-structure design when systems are the core issue
- onboarding, tutorial, teach-through-play, and early-retention fixes
- balance framing for classes, builds, weapons, units, or strategy options
- live-game or replayability analysis around engagement, churn, and system health
- playtest planning and interpretation for system hypotheses

## Do not use this skill for

- engine implementation, rendering, or technical optimization
- concept art, animation, sound, or visual art direction as the main task
- pure worldbuilding, lore, or dialogue writing detached from gameplay systems
- marketing copy or store-page positioning
- shallow gamification work that does not require actual game-system design judgment

## Route here when

Choose **game-designer** when the important question is about one or more of these:

- what the player repeatedly does
- why the player cares enough to continue
- how risk, reward, and mastery interact
- how progression, economy, or difficulty should be paced
- whether choices are meaningful, readable, and balanced
- why onboarding succeeds or players churn early

If the hard part is implementation in a game engine, use an engineering skill. If the hard part is narrative, art, or monetization strategy alone, route accordingly.

## Inputs to gather

Before designing, identify:

- game type, platform, audience, and business model
- target player fantasy and desired emotions
- session length and engagement pattern
- existing mechanics, prototypes, telemetry, or playtest observations
- progression, monetization, social, or content-production constraints
- competitive or genre expectations that players will bring with them

## Output expectations

Return outputs such as:

- core loop or system design proposal
- progression, economy, or balance framework
- onboarding and retention recommendations
- rationale tied to player motivation and tradeoffs
- playtest hypotheses, metrics, and next experiments
- risks, failure modes, and tuning considerations

Prefer design artifacts that another designer or developer could implement or test immediately.

## Working method

### 1. Define the player fantasy and promise
Be explicit about what players are trying to become, feel, or master. Every major system should reinforce that promise.

### 2. Model the core loop clearly
Name the repeatable sequence:

- player action
- challenge or uncertainty
- feedback
- reward or consequence
- next decision

If the loop is muddy, the rest of the design will be muddy too.

### 3. Make choices meaningful
Good game systems create tradeoffs, timing decisions, risk management, and different viable paths. Avoid fake choice where one option is obviously dominant or irrelevant.

### 4. Design progression to amplify play, not replace it
Unlocks, economies, and meta systems should make the core play more interesting. If progression feels better than actually playing, the design is compensating for a weak loop.

### 5. Teach the real game
Onboarding should introduce genuine decisions, feedback, and stakes in a controlled way. Do not build a tutorial that teaches habits the real game later punishes.

### 6. Balance for readability and counterplay
Balance is not perfect symmetry. Aim for understandable strengths, exploitable weaknesses, strategic variety, and recoverable failure states.

### 7. Use playtesting as truth
Frame hypotheses before testing. Identify what player behavior would confirm or falsify the design. Use retention, completion, build diversity, time-to-master, fail points, and sentiment as signals, not vanity metrics.

## Heuristics

Prefer:

- strong player fantasy
- loops with clear feedback and reward logic
- progression that reinforces mastery
- economies with understandable sinks and faucets
- meaningful decisions over feature volume
- onboarding that teaches through action
- explicit hypotheses and tuning levers

Avoid:

- adding systems because competitors have them
- mistaking complexity for depth
- reward treadmills that overshadow play
- opaque balance where players cannot learn why they failed
- tutorials disconnected from the actual game
- overclaiming certainty without playtest evidence

## Adjacent skill boundaries

- **level-designer**: use when spatial layout, encounter spaces, traversal, or mission geography dominate
- **narrative-designer**: use when story structure, branching narrative, or character writing dominates
- **frontend-dev**: use when the main work is implementing interfaces rather than designing gameplay systems
- **product-designer**: use for non-game product UX, even if retention mechanics are discussed

## Quick routing examples

Use **game-designer** for:

- redesigning a roguelite run loop that becomes repetitive after the first hour
- building a progression and resource system for a strategy game without runaway snowballing
- fixing tutorial churn by restructuring the first ten minutes around real player decisions
- tuning a co-op class roster so roles stay distinct without one build dominating

Do not use **game-designer** for:

- coding a combat system in Unity or Unreal
- creating character concept art or UI skins
- writing lore pages without system impact
- adding badges and streaks to a SaaS app unless the work genuinely requires game-design judgment

## Quality bar

A strong result should:

- clarify the player fantasy and core loop
- create meaningful decisions and readable feedback
- align progression, economy, and onboarding with the intended experience
- surface tuning levers, tradeoffs, and likely failure modes
- define what to test next instead of pretending theory is enough
- leave the next operator with implementable or playtestable design guidance

## References to use

Use `prompt.md` for delivery posture.
Use `examples/README.md` for expected output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, inputs, and routing boundaries.
