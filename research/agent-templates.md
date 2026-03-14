# Agent Template Library — Design

## Goal
~100 fully spec'd agent archetypes. When Porter recommends a worker,
it starts from a robust template with pre-written SOUL.md, ROLE_CARD.md,
and appearance_spec. Users confirm with a few questions, then auto-create.

## Architecture

### Template Registry (in porter.py)
```python
AGENT_TEMPLATES = {
    "frontend_dev": {
        "name": "Frontend Developer",
        "category": "engineering",
        "description": "Builds user interfaces with modern web technologies",
        "default_backend": "auto",
        "appearance_archetype": "operator",
        "soul_traits": ["detail-oriented", "visual thinker", "user-focused"],
        "role_card": {
            "mission": "Build and maintain frontend interfaces",
            "inputs": ["design specs", "API docs", "user stories"],
            "outputs": ["components", "pages", "CSS", "tests"],
            "authority": ["frontend code", "CSS/styling", "client-side logic"]
        },
        "tags": ["web", "ui", "react", "css", "javascript"]
    },
    ...
}
```

### Categories (10 groups, ~10 templates each)
1. **Engineering** (~15): Frontend Dev, Backend Dev, Full Stack, Mobile Dev, DevOps/SRE, Database Admin, API Designer, Security Engineer, Performance Engineer, Embedded Dev, ML Engineer, Data Engineer, Platform Engineer, QA Engineer, Release Manager
2. **Design** (~10): UI Designer, UX Researcher, Brand Strategist, Graphic Designer, Motion Designer, Product Designer, Design System Lead, Accessibility Specialist, Interaction Designer, Visual QA
3. **Content** (~12): Content Writer, Technical Writer, Copywriter, Editor, SEO Specialist, Social Media Manager, Email Marketer, Blog Author, Documentation Writer, Translator, Proofreader, Content Strategist
4. **Research** (~10): Research Analyst, Data Analyst, Market Researcher, Competitive Analyst, Fact Checker, Trend Analyst, Academic Researcher, Patent Researcher, User Researcher, Survey Designer
5. **Business** (~10): Product Manager, Project Manager, Business Analyst, Strategy Consultant, Financial Analyst, Operations Manager, Risk Analyst, Growth Hacker, Pricing Analyst, Vendor Manager
6. **Creative** (~8): Storyteller, Game Designer, Music Composer, Video Producer, Podcast Producer, Creative Director, Illustrator, Animator
7. **Support** (~8): Customer Support, Technical Support, Community Manager, Knowledge Base Manager, Training Specialist, Onboarding Specialist, Help Desk, Escalation Manager
8. **Legal & Compliance** (~6): Legal Analyst, Compliance Officer, Contract Reviewer, Privacy Specialist, Policy Writer, Regulatory Analyst
9. **Data & AI** (~8): Data Scientist, ML Ops Engineer, Prompt Engineer, AI Trainer, Data Annotator, Model Evaluator, ETL Developer, BI Developer
10. **Domain Specialists** (~13): Crypto Analyst, Healthcare Analyst, E-commerce Specialist, Education Designer, Real Estate Analyst, Supply Chain Analyst, HR Specialist, Marketing Analyst, Sales Ops, DevRel, Open Source Maintainer, Sustainability Analyst, Localization Manager

### API Endpoints
- `GET /api/templates` — list all templates (with category filter)
- `GET /api/templates/<id>` — get template details
- `POST /api/templates` — create from template (admin only)
- `PUT /api/templates/<id>` — edit template (admin only)

### UI Integration
- Workers tab: recommendation buttons use template IDs
- Admin: Template Library browser with edit capability
- Creation flow: template → confirm name → auto-create with full .md files

## Implementation Plan
1. Add AGENT_TEMPLATES dict with ~100 entries (v0.31.58)
2. Wire up template-based worker creation
3. Admin template browser
4. Delegate .md file generation to GPT-5.4/Gemini

## Status
- [ ] Template registry infrastructure
- [ ] 100 template definitions
- [ ] Template-based creation flow
- [ ] Admin template browser
