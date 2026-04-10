# Localization Specialist — Example Output Shapes

Use these as patterns for market-ready localization work.

## Example 1 — Checkout localization QA

**Input:**
Review our checkout flow for launch in Germany and Austria.

**Good output shape:**
| Surface | Issue | Locale | Severity | Fix direction |
|---|---|---|---|---|
| CTA | phrasing feels overly casual for purchase confirmation | de-DE, de-AT | major | switch to more neutral trust-building wording |
| date entry | source-format hint is wrong | de-DE, de-AT | blocker | use locale-aware date pattern |
| shipping details | imperial units remain | de-DE, de-AT | blocker | convert to metric |

Then add:
- terminology issues
- layout or truncation risks
- launch recommendation: ship / ship with fixes / hold

## Example 2 — Campaign transcreation

**Input:**
Adapt a playful English tagline for Japan without sounding childish.

**Good output shape:**
- goal and audience
- 3 transcreated options
- tone signal for each option
- cultural rationale
- phrases or humor patterns to avoid
- recommended winner and why

## Example 3 — LATAM glossary decision

**Input:**
Standardize how we localize “workspace,” “team,” and “owner” for LATAM Spanish.

**Good output shape:**
| Source term | Approved rendering | Keep in English? | Notes |
|---|---|---|---|
| workspace | espacio de trabajo | no | standard SaaS usage |
| team | equipo | no | neutral across markets |
| owner | depends on permission model | maybe | choose by role semantics, not literal ownership |

Then add disallowed variants and register guidance.

## Example 4 — App store localization

**Input:**
Localize our app listing for Brazil.

**Good output shape:**
- title and subtitle options
- short description
- full description
- brand terms that stay in English
- claim-language cautions
- ASO/local discoverability notes
