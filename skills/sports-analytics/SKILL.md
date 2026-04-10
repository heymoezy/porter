---
name: sports-analytics
description: Analyze players, teams, tactics, game states, matchups, and sports-performance data with sport-aware context so decisions reflect role, opposition, sample size, game state, and competition level rather than shallow box-score narratives. Use when work needs player or team comparison, matchup briefs, tactical-performance diagnosis, advanced-metric interpretation, scouting support, or communication of sports data to coaches, operators, media, or informed fans. Do not use for gambling tout picks, injury diagnosis, medical return-to-play advice, or generic analytics work detached from sport mechanics.
---

# Sports Analytics Specialist

Turn numbers into sport-specific decisions, not stat-sheet theater.

## What this skill is for

Use this skill to interpret performance data in a way that respects how the sport is actually played. Focus on role context, tactical meaning, competition level, game state, sample-size discipline, and translation of metrics into actionable conclusions.

## What this skill should produce

Produce outputs such as:
- player or team analysis memo
- matchup brief
- comparison table with context notes
- advanced-metric explainer for non-analysts
- tactical-performance diagnosis
- scouting-support summary
- decision recommendation with uncertainty and monitoring points

The work should connect the data to real sporting behavior, not just report stat differences.

## Working method

### 1. Define the decision and audience

Clarify whether the work is for coaching, recruitment, roster management, media explanation, fan education, or executive decision support. The same evidence should be framed differently for each.

### 2. Start with the sport’s mechanics

Choose metrics that match how value is created in that sport: possession, efficiency, shot quality, expected threat, field position, lineup context, pressure response, transition control, or other sport-specific mechanisms. Raw totals rarely tell the real story.

### 3. Respect role and deployment

Compare like with like. Position, usage, minutes, touches, scheme responsibilities, teammates, and substitution patterns can distort simple comparisons.

### 4. Handle sample size and state dependence honestly

Hot streaks, tiny matchup splits, and short windows can seduce analysts into fake certainty. State what is descriptive, what might be predictive, and what remains noise.

### 5. Normalize for context

Adjust for opponent quality, game state, score effects, pace, possessions, schedule congestion, venue, league strength, and roster changes where relevant. Unadjusted conclusions are often wrong.

### 6. Translate metrics into tactical meaning

Explain what the numbers imply on the field, court, ice, track, or pitch: shot selection, spacing, line breaking, pressing, defensive recovery, transition exposure, chance suppression, set-piece quality, or finishing variance.

### 7. End with usable uncertainty

Give the takeaway, confidence level, caveats, and what should be monitored next. Good analysis helps decisions without pretending certainty.

## Inputs to gather

Collect as many of these as possible:
- sport, league, competition level, and season context
- specific decision or question being answered
- data source, metric definitions, and timeframe
- player roles, tactical system, opponent context, and lineup availability
- known confounders such as injuries, schedule congestion, venue, pace, or possession environment
- intended audience and how technical the final explanation can be

If evidence is thin, state assumptions instead of filling gaps with false precision.

## Heuristics

Prefer:
- rates, efficiencies, and context-adjusted measures over raw accumulation
- comparisons among similar roles and responsibilities
- separating descriptive findings from predictive claims
- pairing data with tactical interpretation
- confidence language that reflects sample quality
- communication that makes advanced stats legible without flattening nuance

Avoid:
- gambling picks framed as certainty
- medical or injury advice
- highlight-reel commentary with no analytical frame
- role-blind comparisons across players or teams with different jobs
- using advanced metrics as a substitute for understanding the sport itself
- generic analytics language that ignores sport-specific dynamics

## Boundaries

Use adjacent skills when the center of gravity shifts:
- **data-analyst** for general analytical workflows outside sport-specific interpretation
- **forecasting-analyst** for formal predictive modeling as the main deliverable
- **research-analyst** for broader market or business research beyond performance data
- **journalist** for narrative reporting when the primary job is storytelling
- **performance-optimizer** for training, conditioning, or operational-improvement design beyond analytic diagnosis

## Final check

Before finishing, confirm that the output:
- makes the sport context explicit
- uses metrics that actually fit the question
- handles sample size and uncertainty honestly
- links the numbers back to tactics, role, or decision impact
- gives an audience-appropriate conclusion someone can act on

## File map

Use `prompt.md` for delivery stance and answer structure.
Use `examples/README.md` for deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, boundaries, and typical IO.
