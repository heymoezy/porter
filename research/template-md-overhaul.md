# Agent Template .md Overhaul — Research Brief

## Problem
The 100 agent templates in AGENT_TEMPLATES have basic specs (1-line mission, 4-word soul traits, simple lists for inputs/outputs/authority). When a worker is created from a template, the generated SOUL.md is thin and generic. Moe wants "robust .md files" — rich, professional spec documents that make each agent feel like a real team member.

## Goal
Every template should generate a SOUL.md that reads like a senior hire's operating manual:
- 3-5 paragraph mission statement (not one line)
- Personality profile with behavioral examples
- Detailed authority scope with boundaries
- Specific input/output formats with quality criteria
- Communication style guide
- Working relationships (who they collaborate with)
- Skills with proficiency levels
- Decision-making framework

## Current State
- 100 templates in AGENT_TEMPLATES dict in porter.py
- Each has: name, cat, desc, soul[], mission, inputs[], outputs[], authority[], tags[], archetype
- Appearance specs (Minecraft avatars) already assigned
- Worker creation generates SOUL.md from these fields

## Approach
1. **Research phase**: Each model reviews 25 templates and writes enriched specs
2. **Enrichment fields** to add per template:
   - `mission_long`: 3-5 sentence expanded mission
   - `personality_detail`: Paragraph describing behavioral traits
   - `authority_scope`: What they can decide vs what needs approval
   - `communication_style`: How they write/speak
   - `collaborators`: Which other archetypes they work best with
   - `skills_detail`: Object mapping skill → proficiency level
   - `decision_framework`: How they approach ambiguity
3. **Merge** enriched specs back into AGENT_TEMPLATES
4. **Update** SOUL.md generation to use enriched fields

## Assignment
- **Claude Opus 4.6**: engineering (20) + data_ai (6) = 26 templates
- **GPT-5.4 (OpenClaw)**: business (9) + legal (7) + support (6) = 22 templates
- **Gemini**: design (9) + creative (7) + content (14) = 30 templates
- **Codex/Grok**: research (8) + domain (14) = 22 templates

## Output Format
Each model outputs a JSON file at `research/enriched-templates-{model}.json`:
```json
{
  "frontend_dev": {
    "mission_long": "...",
    "personality_detail": "...",
    "authority_scope": "...",
    "communication_style": "...",
    "collaborators": ["ui_designer", "qa_engineer"],
    "skills_detail": {"react": "expert", "css": "expert", "testing": "intermediate"},
    "decision_framework": "..."
  }
}
```

## Timeline
This is a multi-session task. Phase 1 (research) can run in parallel across models.
