# Porter Push-Pull Psychology — Future Phase

**Author:** Moe
**Date:** 2026-03-23
**Status:** Approved concept, awaiting GSD scheduling

---

## Vision

Porter is ALWAYS on as assistant, subtly, through all user chats. Not just when invoked — always present, always helping. Uses push-pull psychology to create natural user addiction through value delivery.

## Core Mechanics

### Push (Proactive Value)
- Surface insights before the user asks ("I noticed your project deadline is in 3 days — here's what's left")
- Anticipate next actions based on patterns ("You usually check metrics after a deployment — here's the summary")
- Celebrate wins and progress unprompted
- Offer help at friction points before user gets stuck

### Pull (Curiosity & Engagement)
- Create curiosity gaps ("I found something interesting about your competitor — want me to dig deeper?")
- Progressive disclosure — don't dump everything at once, reveal in layers
- "I'm working on something for you" — background tasks that build anticipation
- Partial insights that invite deeper exploration

### Subtle Presence
- Never overbearing. Never Clippy.
- Porter speaks when it has something valuable, stays quiet otherwise
- Builds dependency through genuine value, not notifications
- The user should feel like losing a trusted co-pilot if they leave

## Psychology Framework

Reference: **Nir Eyal's Hook Model**
1. **Trigger** — internal (feeling stuck) + external (Porter surfaces an insight)
2. **Action** — user engages with Porter's suggestion (low friction)
3. **Variable Reward** — sometimes a quick answer, sometimes a deep analysis, sometimes a surprise finding
4. **Investment** — user teaches Porter preferences, builds history, creates switching cost

### Anti-Patterns to Avoid
- Never fake urgency
- Never withhold critical info to create engagement
- Never guilt-trip for inactivity
- Never spam notifications
- The addiction must come from VALUE, not manipulation

## Implementation Considerations

- Context-awareness: Porter needs to know what the user is working on, what they care about, what time it is
- Timing: Know when to speak and when to stay silent
- Personality: Warm but professional, confident but not arrogant
- Memory: Remember preferences, past interactions, user's working style
- Graceful degradation: If user ignores suggestions, reduce frequency, don't escalate

## Dependencies

- Memory V2 concepts fully operational (for learning user patterns)
- Agent continuous learning (for having valuable insights to push)
- Chat streaming working across all surfaces
- User activity tracking (to know what they're doing)

## Metrics

- Session frequency (daily active users)
- Session duration (time spent per visit)
- Feature discovery rate (Porter surfaces features user hasn't tried)
- Voluntary engagement (user initiates chat vs Porter pushes)
- Retention at 7/30/90 days
