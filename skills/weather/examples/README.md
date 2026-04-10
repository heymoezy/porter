# weather — Example Output Shapes

Use these as patterns for decision-ready weather answers.

## Example 1 — Best time window

**Input:**
When is the best time to host an outdoor brunch in Austin on Saturday?

**Good output shape:**
- Best window: 9 AM to noon
- Why: warm, lower rain risk, lighter wind than afternoon
- Watchouts: shower chances rise later; heat builds after noon
- Confidence: moderate
- Backup: move earlier or indoors if morning radar trends worsen

## Example 2 — Travel forecast summary

**Input:**
Summarize weather risk for driving from Denver to Vail tonight.

**Good output shape:**
| Segment / Time | Main conditions | Risk level | What it means |
|---|---|---|---|
| Denver departure | dry, cool | Low | easy start |
| higher elevations | snow showers, gusty wind | Medium | slower driving and lower visibility possible |
| late evening | colder roads | Medium | watch for slick spots if precip persists |

Then add:
- best departure window
- confidence note
- when to re-check conditions

## Example 3 — Operational weather brief

**Input:**
What weather risks matter most for tomorrow's construction pour?

**Good output shape:**
- Primary risks: rain timing and gusty wind
- Secondary risks: low morning temperature
- Recommendation: proceed if morning stays dry; prepare tarp and revised timing if showers arrive before noon
- Confidence: moderate because shower timing is still shifting

## Example 4 — Simple practical answer

**Input:**
Do I need a jacket in London this evening?

**Good output shape:**
- Yes, bring a light-to-medium jacket
- Why: cool temperatures, breeze, and possible light showers
- Optional extra: umbrella if you'll be outside for long
