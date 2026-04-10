---
name: weather
description: Interpret current weather, short-range forecasts, timing uncertainty, and weather-sensitive operational risk for travel, events, filming, field work, logistics, staffing, agriculture, and day-to-day planning. Use when the main task is turning weather data into a practical recommendation: best time window, go/no-go call, route risk, packing guidance, hazard watchouts, or confidence-aware forecast summary. Do not use when the main work is climate analysis, historical climatology, or emergency-management instruction beyond pointing to official alerts.
---

# weather

Turn forecast noise into a decision.

This skill owns practical weather interpretation: identifying the place, time, and weather variables that actually matter; translating forecast signals into recommendations; and communicating uncertainty without fake precision.

## Scope

Use this skill for:
- current-conditions and near-term forecast interpretation
- hourly and multi-day planning summaries
- outdoor-event, filming, sports, travel, and commute weather guidance
- weather risk framing for logistics, construction, field work, staffing, and agriculture
- comparing time windows or locations based on weather suitability
- precipitation, wind, heat, cold, storm, snow, visibility, or air-quality watchouts when decision-relevant

## Do not use this skill for

Do not use this skill for:
- climate-change attribution or long-horizon climatology analysis
- emergency-management directives beyond advising users to check official alerts
- medical or legal advice tied to exposure, cancellation, or liability
- pretending to know live conditions without a location, time, and source

## Routing rules

Route to **weather** when the core need is:
- what conditions are likely and when
- what weather factor matters most for the plan
- whether conditions support, threaten, or delay an activity
- which time window or route is safer or more comfortable
- how confident the forecast is and when to re-check

Do not route here if weather is only background flavor and the main task is travel booking, event production, or operations planning without real forecast interpretation.

## Inputs to gather

Before answering, identify:
- exact location or route
- relevant date, time window, and timezone
- decision context: event, drive, flight, filming, work shift, field operation, etc.
- critical thresholds if known: rain, lightning, wind, heat, snow, visibility, AQI
- whether the user needs current conditions, future forecast, comparison, or risk screen
- whether live forecast data must be fetched

If place or time is missing, fix that first. Weather answers without both are usually noise.

## Output expectations

Return outputs such as:
- concise decision-ready forecast summaries
- best time window recommendations
- route or event weather risk tables
- current-conditions snapshots with practical advice
- confidence notes and re-check timing
- hazard watchlists tied to operational impact

Lead with the decision, then support it with only the numbers that matter.

## Working method

### 1. Frame the decision
Classify the task as:
- conditions check
- planning forecast
- location / time comparison
- risk screening
- operational weather brief

Then define what a good decision looks like.

### 2. Pull the forecast variables that change the decision
Prioritize only what matters, such as:
- precipitation chance, timing, and intensity
- temperature and feels-like conditions
- sustained wind and gusts
- lightning, thunderstorms, snow, or icing risk
- visibility, fog, cloud cover, or daylight limits
- heat, cold, or air-quality stress when operationally relevant

Do not dump a full weather panel if the user needs a recommendation.

### 3. Respect source quality and freshness
When live data is required, prefer official or primary forecast sources for the region when available. Cross-check unusual or high-impact claims. Weather is time-sensitive; stale forecasts mislead fast.

### 4. Communicate uncertainty honestly
State:
- what is most likely
- what could still shift materially
- where confidence is high, moderate, or low
- when the user should re-check
- what contingency is sensible if the forecast deteriorates

Rain timing and convective storms especially need humility.

### 5. Translate into action
Convert forecast into plain decisions such as:
- best outdoor window
- carry-rain-plan recommendation
- delay / reroute / proceed guidance
- staffing, packing, or equipment adjustments
- main operational hazard to watch

### 6. Escalate severe-weather language carefully
If conditions may become dangerous, name the hazard clearly and point to official alerts or local authorities for warning-level guidance. Do not role-play as an emergency authority.

## Heuristics

Prefer:
- place-and-time specificity
- time-block recommendations
- risk-ranked weather variables
- confidence-aware language
- operational consequences over meteorology trivia

Avoid:
- answering weather questions without a usable location and timeframe
- confusing rain chance with rain timing or intensity
- mixing sustained wind and gusts as if they are the same
- implying exact storm timing when the forecast is unstable
- burying the recommendation under raw numbers

## Adjacent skill boundaries

- **travel-planner** may own itinerary design, but **weather** owns forecast interpretation for the route or destination
- **operations-manager** may own staffing or service decisions once the weather signal is clear
- **risk-assessor** may support broader operational risk framing when weather is one of several risks
- **video-producer** or **event skills** may own the production/event plan, but **weather** should translate forecast into conditions guidance

## Quick routing examples

Use **weather** for:
- choosing the best time for an outdoor brunch, shoot, or run
- summarizing weather risk for a mountain drive tonight
- briefing a field team on wind, heat, and thunderstorm risk tomorrow
- comparing two destinations for weekend weather suitability

Do not use **weather** for:
- writing climate-trend analysis
- giving evacuation or safety directives as if you are an official source
- answering “what will it be like?” without place and time

## Quality bar

A strong result should:
- anchor the answer to a real place and time
- focus on the few forecast variables that affect the plan
- distinguish likely conditions from uncertainty
- give a clear recommendation, not just weather data
- tell the user when to re-check if conditions are unstable

## Use with

- `prompt.md` for execution posture and response shape
- `examples/README.md` for representative forecast-answer patterns
- `guides/qa-checklist.md` for final review
- `meta/skill.json` for machine-readable metadata
