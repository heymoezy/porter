# Agent Template Review — 2026-03-23

Full audit of all 103 templates in porter.db (`agent_templates` table).

---

## 1. Category Breakdown

| Category     | Count | ID Prefix | Notes |
|-------------|-------|-----------|-------|
| engineering | 17    | `eng-`, `sys-` | Includes 2 internal system agents (CRM Sweep, Maintenance) |
| domain      | 13    | `dom-`    | Vertical/industry specialists |
| content     | 12    | `cnt-`    | Writers, editors, SEO, social |
| business    | 10    | `biz-`    | Strategy, ops, finance, PM |
| design      | 10    | `des-`    | UI, UX, brand, motion |
| research    | 10    | `res-`    | Market, academic, competitive, user |
| data-ai     | 9     | `dai-`, `sys-` | ML, BI, ETL, prompt eng; includes 1 internal (Analytics Collector) |
| creative    | 8     | `cre-`    | Video, animation, music, games |
| support     | 8     | `sup-`    | Helpdesk, onboarding, training |
| legal       | 6     | `leg-`    | Compliance, contracts, privacy |
| **TOTAL**   | **103** | | 3 are internal (`is_internal=1`) |

### Internal System Agents (3)
- `sys-analytics-agent` — Analytics Collector (category: data-ai)
- `sys-crm-sweeper` — CRM Sweep Agent (category: engineering)
- `sys-maintenance` — System Maintenance Agent (category: engineering)

These are misplaced in user-facing categories. They should either have their own `system` category or be filtered out of user template listings.

---

## 2. Queue Master / Intake Coordinator Candidates

**No template currently serves as a Queue Master, intake coordinator, prioritizer, or scheduler.**

Closest existing templates:
- `biz-project-mgr` (Project Manager) — "Plans, tracks, and delivers projects on time and within scope." Tracks delivery but does NOT do work intake/triage.
- `biz-operations` (Operations Manager) — "Designs and improves operational processes." Process design, not queue management.
- `sup-helpdesk` (Help Desk Coordinator) — "Manages the support ticket queue and ensures SLA compliance." Queue management but scoped to support tickets only.
- `eng-release-mgr` (Release Manager) — "Coordinates safe, predictable software releases." Coordinates releases, not general work intake.

**Verdict:** None of these is a Queue Master. The Queue Master concept — an agent that triages all incoming work, assigns priority, routes to the right worker, and manages the execution queue — does not exist. This is a gap.

---

## 3. Overlap with 9 Base Forge Templates

The 9 forge archetypes from the design spec (Orchestrator, Writer, QA Inspector, Skills Specialist, Tools Specialist, Analyst, Operations, Router, Designer) are META-roles for the forge assembly line itself. They overlap with user-facing templates in these ways:

| Forge Archetype    | Overlapping User Templates | Severity |
|-------------------|---------------------------|----------|
| **Orchestrator**   | `biz-project-mgr`, `biz-operations` | Low — forge Orchestrator is internal pipeline control |
| **Writer**         | `cnt-writer`, `cnt-copywriter`, `cnt-technical`, `cnt-editor` | Medium — name collision, different purpose |
| **QA Inspector**   | `eng-qa`, `des-visual-qa` | Medium — same skill domain, different scope |
| **Skills Specialist** | None | Clean |
| **Tools Specialist**  | None | Clean |
| **Analyst**        | `biz-analyst`, `res-analyst`, `dai-scientist`, `biz-financial` | High — "Analyst" is overloaded |
| **Operations**     | `biz-operations` | Medium — direct name collision |
| **Router**         | None (but `sup-helpdesk` is partial) | Clean |
| **Designer**       | `des-product`, `des-ui`, `des-system-lead`, `des-interaction` | High — "Designer" is overloaded |

**Recommendation:** The forge archetypes must be clearly namespaced (e.g., `forge-writer` vs `cnt-writer`) so users never confuse internal forge machinery with hirable worker templates.

---

## 4. Duplicates and Near-Duplicates

### HIGH OVERLAP (same role, different packaging)

| Templates | Issue |
|-----------|-------|
| `cnt-writer` (Content Writer) vs `cnt-copywriter` (Copywriter) | Both write marketing/content. Distinction is thin: "long-form" vs "persuasive." Could be one template with a style parameter. |
| `cnt-editor` (Content Editor) vs `cnt-proofreader` (Proofreader) | Editor "edits and elevates content for clarity" vs Proofreader "catches grammar, spelling, punctuation." Proofreader is a strict subset of Editor. |
| `cnt-strategist` (Content Strategist) vs `cnt-blog` (Blog Strategist) | Blog Strategist is Content Strategist scoped to one channel. Unnecessary specialization. |
| `cnt-seo` (SEO Content Strategist) vs `cnt-strategist` (Content Strategist) | SEO is a subspecialty of content strategy. Same shape, different keyword. |
| `res-analyst` (Research Analyst) vs `res-data` (Data Researcher) | Both "synthesize information from multiple sources." Data Researcher adds Python/SQL. Minor distinction. |
| `res-user` (User Researcher) vs `des-ux-researcher` (UX Researcher) | Near-identical. User Researcher = "qualitative methods, interviews, usability." UX Researcher = "user research, usability tests, behavioral insights." Same job. |
| `dai-etl` (ETL Developer) vs `eng-data-engineer` (Data Engineer) | ETL Developer "builds data extraction/transformation/loading pipelines." Data Engineer "builds pipelines that move, transform, and deliver data." Same job, different label. |
| `dai-scientist` (Data Scientist) vs `res-data` (Data Researcher) | Both analyze data with Python/stats. Data Scientist adds "modeling." |
| `dom-localization` (Localization Program Manager) vs `cnt-translator` (Localization Specialist) | Both do localization. One "manages programs," other "translates and adapts content." Manager vs doer, but in practice same domain. |
| `dom-marketing` (Marketing Strategist) vs `biz-growth` (Growth Strategist) | "Integrated marketing strategies to drive growth" vs "growth experiments, acquisition-to-retention funnel." Heavily overlapping. |
| `leg-compliance` (Compliance Officer) vs `leg-regulatory` (Regulatory Affairs Specialist) | Compliance "regulatory requirements" vs Regulatory "regulatory submissions, approvals." Near-identical domain. |
| `leg-analyst` (Legal Analyst) vs `leg-policy` (Policy Writer) | Legal Analyst "researches legal questions." Policy Writer "drafts policies and terms." Different outputs but same legal research skill. |
| `eng-backend-dev` vs `eng-fullstack` vs `eng-frontend-dev` | Full-Stack is explicitly "database to UI" — a superset of Backend + Frontend. Three templates for what's really a spectrum. |
| `des-product` (Product Designer) vs `des-ui` (UI Designer) vs `des-interaction` (Interaction Designer) | Product Designer "end-to-end design." UI Designer "interface designs in Figma." Interaction Designer "behavior and microinteractions." Product Designer is a superset. |
| `des-motion` (Motion Designer) vs `cre-animator` (2D Animator) | Both do animation. Motion Designer = "UI, marketing, video." 2D Animator = "explainer videos, UI, marketing." Near-identical. |
| `biz-analyst` (Business Analyst) vs `biz-strategy` (Strategy Consultant) | BA "bridges business needs and technical solutions." Strategy Consultant "analyzes strategic options." Both analyze business problems. |
| `sup-customer` (Customer Support Agent) vs `sup-technical` (Technical Support Specialist) | One handles general inquiries, other handles "complex technical issues." Could be one template with complexity parameter. |

### MEDIUM OVERLAP (adjacent roles, could merge with config)

| Templates | Issue |
|-----------|-------|
| `biz-product-mgr` vs `biz-project-mgr` | PM vs PjM — legitimate distinction in industry but very easy to confuse. |
| `cre-storyteller` vs `cnt-writer` | Storyteller "crafts compelling narratives" vs Content Writer "engaging long-form content." |
| `cre-video` vs `cre-podcast` | Both produce media content. Different formats but similar skills. |
| `sup-onboarding` vs `sup-training` | Onboarding = first-time setup. Training = ongoing education. Blurry line. |

---

## 5. Generic/Filler vs Genuinely Useful

### FILLER — too generic or niche to be useful as AI agents

| Template | Why it's filler |
|----------|----------------|
| `dom-supply-chain` (Supply Chain Analyst) | Too niche for most Porter users. An AI agent cannot actually manage physical supply chains. |
| `dom-real-estate` (Real Estate Analyst) | Extremely vertical. No AI tool connections possible. |
| `dom-healthcare` (Healthcare Domain Expert) | Requires actual clinical knowledge. Dangerous to have an AI pretend. |
| `dom-sustainability` (Sustainability Analyst) | ESG reporting is specialized. Limited AI utility. |
| `dom-crypto` (Crypto & Web3 Specialist) | Niche vertical. DeFi/smart contract advice from an AI template is risky. |
| `eng-embedded` (Embedded Systems Engineer) | C/C++/Rust microcontrollers. Almost no one will use this through Porter. |
| `cre-music` (Music Producer) | AI cannot compose/mix music through Porter's tool ecosystem. |
| `cre-game-designer` (Game Designer) | Extremely niche. AI game design through text chat is impractical. |
| `dai-annotator` (Data Annotation Lead) | Data labeling workflows need real annotation platforms, not chat. |
| `dai-ml-ops` (MLOps Engineer) | Kubernetes model deployment — too infrastructure-heavy for a chat agent. |
| `res-patent` (Patent Researcher) | Needs actual patent database access. Template alone is useless. |
| `res-survey` (Survey Researcher) | Needs survey distribution platform. Template alone is decorative. |
| `leg-regulatory` (Regulatory Affairs Specialist) | Government submissions — too niche, too risky for AI. |
| `dom-education` (EdTech Specialist) | Niche vertical with no tool connections. |

### GENUINELY USEFUL — clear value as AI workers

| Template | Why it's good |
|----------|--------------|
| `cnt-writer` | Core writing capability. Every workspace needs it. |
| `cnt-technical` | API docs, guides — directly useful with code tools. |
| `eng-frontend-dev` | Can review/generate React/TS code. |
| `eng-backend-dev` | Can review/generate server code. |
| `eng-qa` | Can write test strategies, review test coverage. |
| `eng-devops` | CI/CD pipeline design, Dockerfile review. |
| `des-product` | End-to-end design thinking. |
| `des-system-lead` | Design system governance. |
| `biz-product-mgr` | Spec writing, prioritization. |
| `biz-project-mgr` | Planning, tracking. |
| `res-competitive` | Competitive intelligence. |
| `res-market` | Market sizing. |
| `dai-prompt-eng` | Directly useful for AI-first product. |
| `dai-evaluator` | AI quality/safety evaluation. |
| `sup-customer` | Customer support automation. |
| `sup-helpdesk` | Ticket queue management. |
| `cnt-social-media` | Social content creation. |
| `cnt-email-marketer` | Email campaign design. |

---

## 6. Recommendations

### A. Immediate Cleanup (reduce from 103 to ~70)

1. **Merge near-duplicates** into single templates with configurable style/focus:
   - `cnt-editor` absorbs `cnt-proofreader` (add proofreading as a mode)
   - `cnt-strategist` absorbs `cnt-blog` and `cnt-seo` (channel/focus as parameter)
   - `res-analyst` absorbs `res-data` (tools as parameter)
   - `des-ux-researcher` absorbs `res-user` (or vice versa — pick one)
   - `eng-data-engineer` absorbs `dai-etl` (same job)
   - `des-motion` absorbs `cre-animator` (same job)
   - `leg-compliance` absorbs `leg-regulatory` (same domain)
   - `dom-marketing` absorbs `biz-growth` (or separate more clearly)

2. **Remove or archive filler** (14 templates flagged above). Move to an "advanced" or "community" tier rather than deleting — lets the catalog still show breadth without polluting the default view.

3. **Fix system agent categorization.** The 3 `sys-*` agents should not be in `data-ai` or `engineering`. Either:
   - Create a `system` category (hidden from user-facing template browser)
   - Or filter `is_internal=1` out of all user-facing queries (already done in `seedPipeline`)

### B. Add Missing Archetypes

1. **Queue Master** — the #1 gap. Template spec:
   - ID: `sys-queue-master` or `ops-queue-master`
   - Role: Triages all incoming tasks, assigns priority (P0-P3), routes to correct worker, monitors SLA, escalates blockers
   - Skills: prioritization, routing, SLA-management, escalation
   - This is the agent that sits between Porter (orchestrator) and all workers

2. **Scheduler** — no template handles time-based planning:
   - When should things happen, deadline management, calendar awareness
   - Currently split across Project Manager and Operations Manager but neither owns it

3. **Reviewer/Approver** — no template for the "second pair of eyes" pattern:
   - Reviews worker output before delivery
   - Different from QA (which tests code) — this reviews any deliverable

### C. Structural Improvements

1. **Add `archetype` field** to templates (navigator, operator, maker, auditor, warden, scholar — per the original design). Currently only in porter.py legacy, not in DB.

2. **Add `complexity` or `tier` field** — basic/intermediate/advanced. Lets the UI show simpler templates first, advanced ones for power users.

3. **Namespace forge archetypes** clearly. The 9 forge roles (Orchestrator, Writer, etc.) must never share IDs or names with user templates. Use `forge-` prefix consistently.

4. **Tag internal agents properly.** `sys-crm-sweeper` is in `engineering` category, `sys-analytics-agent` in `data-ai`. Both should be `system` or at minimum consistently categorized.

---

## 7. Summary Stats

- **Total templates:** 103 (100 user-facing, 3 internal)
- **Categories:** 10
- **Near-duplicate pairs:** 17 identified
- **Filler/impractical:** 14 flagged
- **Recommended target after cleanup:** ~70 user-facing templates
- **Missing critical roles:** Queue Master, Scheduler, Reviewer
- **Forge archetype name collisions:** 5 (Writer, QA, Analyst, Operations, Designer)
