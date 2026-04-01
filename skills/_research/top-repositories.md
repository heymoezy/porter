# AI Agent Skills — reference repositories and builders

Curated for Porter Forge redesign.

## Best repositories to study

1. **VoltAgent/awesome-agent-skills**  
   Broadest curated collection. Best for taxonomy, breadth, and discoverability patterns.

2. **anthropics/skills**  
   Official Anthropic patterns. Strong examples of progressive disclosure and multi-file packs.

3. **supabase-community/agent-skills**  
   Excellent for domain-specific skills with real operational value.

4. **ComposioHQ/awesome-claude-skills**  
   Good curation around workflow skills and integrations.

5. **skillmatic-ai/awesome-agent-skills**  
   Useful alternative curation source with modern tagging language.

6. **gmh5225/awesome-skills**  
   Practical repository index across multiple agent ecosystems.

7. **maragudk/skills**  
   Small but clean. Strong signal for quality over quantity.

8. **apify/agent-skills**  
   Great model for execution-oriented scraping / automation skill packs.

9. **guanyang/antigravity-skills**  
   Interesting for broader, composable software skills.

10. **seb1n/awesome-ai-agent-skills**  
    Self-contained skill library patterns instead of just links.

## Skill builders worth studying

- **FrancyJGLisboa/agent-skill-creator** — strongest inspiration for a real builder flow.
- **metaskills/skill-builder** — useful for prompt scaffolding ideas.
- **joelmeaders/agent-skill-builder** — structured framework approach.

## What Porter should borrow

- Directory-per-skill
- `SKILL.md` as the human-readable anchor
- machine-readable metadata (`meta/skill.json`)
- examples folder
- QA checklist / prompting guide
- builder that creates both DB row + filesystem pack
- category / source / featured / deployment metadata in registry

## What Porter should do better

- Treat skills as deployable product assets, not just prompt snippets
- Show assignment counts, template usage, and pack health in Forge
- Make builder generate complete packs, not just one markdown file
- Keep Skills and Tools separate in Forge
