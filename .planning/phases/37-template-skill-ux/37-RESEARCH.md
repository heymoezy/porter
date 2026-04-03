# Phase 37: Template Skill UX — Research

**Researched:** 2026-04-02
**Domain:** Admin frontend — template detail skill management UX + supporting backend endpoints
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
- Template detail skills section layout (table or card grid)
- Drag-and-drop or manual sort for skill reordering
- Mandatory vs optional skill toggle per assignment
- Aggregated effectiveness display across all spawned agents
- Preview feature: show which skills would auto-select for a sample task prompt
- API endpoints for skill assignment CRUD on templates

### Deferred Ideas (OUT OF SCOPE)
None specified.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TUX-01 | Template detail view shows assigned skills from template_skills with why each is attached | template_skills table has sort_order but no rationale column — migration needed; existing `/api/admin/templates/:id/skill-effectiveness` endpoint already returns skills list |
| TUX-02 | Admin can attach, detach, and reorder skills on a template from the template detail page | No CRUD endpoints on `templates.ts` for skill assignments yet — must add POST/DELETE/PATCH to `/api/admin/templates/:id/skills`; sort_order column exists |
| TUX-03 | Template authoring supports marking skills as mandatory vs optional and setting priority | `template_skills` table lacks `is_mandatory` and `assignment_rationale` columns — DB migration required |
| TUX-04 | Template detail shows recent skill effectiveness across all spawned agents using that template | Endpoint `/api/admin/templates/:id/skill-effectiveness` already exists and returns aggregated data; `SkillEffectivenessBar` component exists |
| TUX-05 | Template detail shows what runtime auto-detection will select for sample task prompts | `selectSkills()` in `backend/src/services/skill-selector.ts` is the function — needs a preview-mode variant accessible via admin API that takes a template_id + sample prompt |
</phase_requirements>

---

## Summary

Phase 37 is a frontend-heavy phase that adds a skill management command center inside the agent/template detail view (`agent-detail.tsx`). The existing page already handles templates — it loads template data when the URL points to a template ID and shows a BUILD tab and SOUL/IDENTITY/ROLE_CARD file tabs. The skills section currently exists only for born agent instances (behind `hasApi` guard); templates get no direct skill authoring UI.

The core gap is threefold: (1) the `template_skills` table lacks `is_mandatory` and `assignment_rationale` columns needed for TUX-03 and TUX-01, (2) the admin backend `templates.ts` has no CRUD endpoints for skill assignment management (only a read-only effectiveness query exists), and (3) no admin-accessible preview endpoint exists to expose `selectSkills()` for TUX-05.

The existing infrastructure is very close: `SkillEffectivenessBar`, `SkillQualityBadge`, TanStack Query patterns, and the skills table with quality_tier/quality_score are all ready to consume. The skill-selector logic in the Brain backend is pure and testable — a thin proxy from admin backend to Brain (or a reimplemented version using the same DB pool) can power the preview feature.

**Primary recommendation:** Add a "Skills" tab to `agent-detail.tsx` that activates for template views (not just born instances). Back it with three new admin API endpoints: skill list/attach/detach/reorder, and a preview endpoint. Run a single DB migration to add `is_mandatory` and `assignment_rationale` to `template_skills`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 + React Router 7 | 19.2.4 / 7.13.1 | Frontend SPA | Already in use — do not diverge |
| TanStack Query v5 | 5.91.3 | Server state, mutations, cache invalidation | Already used throughout agent-detail.tsx |
| shadcn/ui (Radix + Tailwind) | current | Badge, Button, Card, Switch, Input, Tabs | Design system — no raw HTML elements |
| lucide-react | 0.577.0 | Icons | Existing icon set |
| Fastify 5 | current | Admin backend API routes | All admin routes use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `SkillQualityBadge` | internal | Quality tier display | On every skill row in the assignment list |
| `SkillEffectivenessBar` | internal | Effectiveness visualization | In TUX-04 effectiveness section |
| recharts | 3.8.1 | Optional bar chart for effectiveness | Only if a chart adds value beyond the bar component |

### No DnD Library Needed
No drag-and-drop library (`@dnd-kit/core`, `react-beautiful-dnd`) is installed. Given the context (admin power tool, not consumer UI), use **up/down arrow buttons** for reordering (manual sort). This avoids a new dependency. If DnD is desired, `@dnd-kit/core` + `@dnd-kit/sortable` is the correct choice for React 19 compatibility — but it requires `npm install` approval from Moe. Recommend arrow buttons to stay dependency-free.

**Installation:**
```bash
# No new installs required for the arrow-button approach
# If DnD is approved: npm install @dnd-kit/core @dnd-kit/sortable (admin/frontend)
```

---

## Architecture Patterns

### Where the Skills Tab Lives

The template detail view is `agent-detail.tsx`. It already renders a "skills-tab" tab for born agent instances (`hasApi` = true). The fix is to also show a **template skills authoring tab** when the view is a template (not an instance). The existing tab system already supports this pattern:

```typescript
// Current: hasApi && ( <TabsTrigger value="skills-tab"> )
// New: show a "template-skills-tab" when !isInstance
```

The two tabs serve different purposes:
- `skills-tab` — existing, shows persona's runtime skills (born instances only)
- `template-skills-tab` — NEW, shows template's authoritative skill list with CRUD

### API Surface (admin/backend/src/routes/templates.ts)

Four new endpoints on the existing `templatesRoutes`:

```
GET  /api/admin/templates/:id/skills        — list assigned skills with metadata
POST /api/admin/templates/:id/skills        — attach a skill { skill_id, is_mandatory?, assignment_rationale? }
DELETE /api/admin/templates/:id/skills/:skillId  — detach a skill
PATCH /api/admin/templates/:id/skills/:skillId   — update sort_order, is_mandatory, assignment_rationale
POST /api/admin/templates/:id/skills/preview     — preview auto-detection { prompt: string }
```

The existing `GET /api/admin/templates/:id/skill-effectiveness` endpoint (already deployed, TUX-04) does not need changes.

### DB Migration (Wave 0)

`template_skills` needs two new columns:

```sql
ALTER TABLE template_skills ADD COLUMN IF NOT EXISTS is_mandatory INTEGER DEFAULT 0;
ALTER TABLE template_skills ADD COLUMN IF NOT EXISTS assignment_rationale TEXT DEFAULT '';
```

Migration file: `drizzle/migrate-tux-v1.ts` following the `migrate-qlt-v1.ts` convention from Phase 36.

Also update Drizzle `schema.ts`:

```typescript
export const templateSkills = pgTable('template_skills', {
  templateId: text('template_id').notNull(),
  skillId: text('skill_id').notNull(),
  sortOrder: integer('sort_order').default(0),
  isMandatory: integer('is_mandatory').default(0),        // NEW
  assignmentRationale: text('assignment_rationale').default(''),  // NEW
  successRate30d: doublePrecision('success_rate_30d').default(0),
  totalUses: integer('total_uses').default(0),
  lastUsed: doublePrecision('last_used'),
});
```

### Preview Endpoint Logic

`selectSkills()` in `backend/src/services/skill-selector.ts` takes `(agentId, taskText)` and queries `persona_skills`. For preview, we need the same logic but starting from `template_skills` instead:

The preview endpoint should:
1. Accept `{ prompt: string }` in request body
2. Query `template_skills` for the template's assigned skills
3. Fetch skill metadata (name, description, tags) from `skills` table
4. Read triggers from `skills/{id}/meta/skill.json` on disk
5. Run the same `scoreSkill()` logic inline (or import it if accessible)
6. Return ranked candidates + which would be selected (top 3, score >= 1)

Since `scoreSkill()` is a pure function exported from the Brain's `skill-selector.ts`, it cannot be directly imported from the admin backend. **Replicate the scoring logic inline** in the admin backend — it is a small pure function (~50 lines). This follows the existing pattern (see `regenSkillsManifest` inlined in `admin/backend/src/routes/skills.ts`).

### Recommended Component Structure

```
admin/frontend/app/
├── routes/
│   └── agent-detail.tsx         — add TemplateSkillsTab section inside existing tabs
├── components/
│   └── template-skill-row.tsx   — NEW: single row in the skills assignment table
```

A lightweight `TemplateSkillsTab` section embedded directly in `agent-detail.tsx` is preferred over a separate file — it keeps all template detail logic co-located, consistent with how the existing BUILD tab content is embedded. If the component grows beyond ~150 lines, extract to `components/forge/template-skills-tab.tsx`.

### Skill Assignment Row Display

Each assigned skill row should show:
- Skill name (linked to `/skills/:id/pack`)
- `SkillQualityBadge` with quality_tier
- Short description (truncated)
- `assignment_rationale` (editable inline text or shown as muted label)
- `is_mandatory` toggle (Switch component)
- Up/Down sort buttons (arrow icon buttons)
- Remove button (X / trash icon)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quality tier display | Custom badge markup | `SkillQualityBadge` component | Already exists with all 5 tiers |
| Effectiveness visualization | Custom progress bar | `SkillEffectivenessBar` component | Already handles null, zero data, compact mode |
| Skill scoring logic | New scoring algorithm | Replicate `scoreSkill()` from skill-selector.ts | Pure function, well-tested, already defined |
| API result caching | Manual state | TanStack Query `useQuery` + `useMutation` with `invalidateQueries` | Used everywhere in agent-detail.tsx |
| Sort number management | Complex re-indexing | Simple integer offset (0, 1, 2...) with swap on up/down | Matches existing `sort_order` pattern |

**Key insight:** The skill preview is not a new scoring system — it is the same `scoreSkill()` logic already in Phase 33, applied against `template_skills` instead of `persona_skills`. Do not invent a different algorithm.

---

## Common Pitfalls

### Pitfall 1: Rendering the Skills Tab for the Wrong View Mode
**What goes wrong:** The existing `skills-tab` is guarded by `hasApi` (born instances only). Adding a template skills tab without checking `!isInstance` will show it for instances too, causing confusion between "this agent's runtime skills" and "the template's authoritative loadout."
**How to avoid:** Use `!isInstance` (not `!hasApi`) to gate the template skills tab. The two tabs are complementary — template authors see the template tab; born agents see the instance tab.
**Warning signs:** Duplicate tabs appearing, or a template showing an instance's toggle switches.

### Pitfall 2: Sort Order Gaps After Delete
**What goes wrong:** Deleting a skill at sort_order=1 from [0,1,2] leaves [0,2] — gaps that look wrong if displayed as "priority 1, priority 3."
**How to avoid:** After delete, re-normalize sort_order starting from 0. Simple: `UPDATE template_skills SET sort_order = sub.rn FROM (SELECT skill_id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS rn FROM template_skills WHERE template_id=$1) sub WHERE template_skills.skill_id = sub.skill_id AND template_skills.template_id=$1`.
**Warning signs:** Gaps appearing in UI numbering after delete operations.

### Pitfall 3: Preview Endpoint Returning Wrong Results
**What goes wrong:** The preview queries `persona_skills` (per-agent) instead of `template_skills` (per-template), returning empty results for templates with no spawned agents.
**How to avoid:** The preview endpoint must query `template_skills WHERE template_id = $1`, not `persona_skills`. This is distinct from the live `selectSkills()` function which is agent-scoped.
**Warning signs:** Preview always returns empty even when template has assigned skills.

### Pitfall 4: Forgetting the Brain vs Admin Backend Split
**What goes wrong:** Trying to import `selectSkills` from `backend/src/services/skill-selector.ts` into `admin/backend/src/` — these are separate Node processes with no shared module system.
**How to avoid:** Inline the scoring logic in the admin backend preview endpoint. It is ~50 lines of pure TypeScript. Do not bridge via HTTP to Brain for this.
**Warning signs:** Import errors, relative path resolution failures at build time.

### Pitfall 5: The `hasApi` vs `isInstance` Guards
**What goes wrong:** `hasApi` means "we got data from `/api/admin/agents/:id`" — but templates also return data from this endpoint if they are stored as personas. `isInstance` is derived from `p.template_id` being set.
**How to avoid:** Use `isInstance` (template-vs-instance) not `hasApi` (API-reachable-vs-not) as the gate for showing template skills UI.

---

## Code Examples

### GET template skills endpoint (admin/backend/src/routes/templates.ts)
```typescript
// Source: verified against existing templates.ts patterns
fastify.get('/:id/skills', async (req) => {
  const { id } = req.params as { id: string };
  const rows = await queryAll(
    `SELECT ts.skill_id, ts.sort_order, ts.is_mandatory, ts.assignment_rationale,
            s.name, s.description, s.category, s.quality_tier, s.quality_score
     FROM template_skills ts
     JOIN skills s ON s.id = ts.skill_id
     WHERE ts.template_id = $1
     ORDER BY ts.sort_order ASC, s.name ASC`,
    [id]
  );
  return ok({ template_id: id, skills: rows });
});
```

### POST attach skill endpoint
```typescript
fastify.post('/:id/skills', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { skill_id, is_mandatory = 0, assignment_rationale = '' } = req.body as {
    skill_id: string; is_mandatory?: number; assignment_rationale?: string;
  };
  if (!skill_id) { reply.status(400); return err('INVALID_INPUT', 'skill_id required'); }

  const maxOrder = await queryOne<{ max: number | null }>(
    'SELECT MAX(sort_order) AS max FROM template_skills WHERE template_id = $1', [id]
  );
  const nextOrder = (maxOrder?.max ?? -1) + 1;

  await execute(
    `INSERT INTO template_skills (template_id, skill_id, sort_order, is_mandatory, assignment_rationale)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (template_id, skill_id) DO NOTHING`,
    [id, skill_id, nextOrder, is_mandatory, assignment_rationale]
  );
  return ok({ attached: true, template_id: id, skill_id });
});
```

### Preview endpoint (inline scoreSkill replica)
```typescript
fastify.post('/:id/skills/preview', async (req) => {
  const { id } = req.params as { id: string };
  const { prompt: taskText = '' } = req.body as { prompt?: string };

  const rows = await queryAll<{ skill_id: string; name: string; description: string; tags: unknown }>(
    `SELECT ts.skill_id, s.name, s.description, COALESCE(s.tags, '[]'::jsonb) AS tags
     FROM template_skills ts JOIN skills s ON s.id = ts.skill_id
     WHERE ts.template_id = $1`, [id]
  );

  // Inline scoreSkill logic (replicated from backend/src/services/skill-selector.ts)
  const taskWords = new Set(taskText.toLowerCase().split(/[\s\p{P}]+/u).filter(w => w.length >= 3));
  const SCORE_THRESHOLD = 1;
  const MAX_SELECTED = 3;

  const candidates = rows.map(skill => {
    const tags = Array.isArray(skill.tags) ? skill.tags as string[] : [];
    let score = 0; const matched: string[] = [];
    // ... scoring logic identical to scoreSkill() ...
    return { skillId: skill.skill_id, name: skill.name, score, matched };
  });

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.filter(c => c.score >= SCORE_THRESHOLD).slice(0, MAX_SELECTED);
  return ok({ candidates, selected, prompt: taskText });
});
```

### Frontend query + mutation pattern (agent-detail.tsx)
```typescript
// Source: existing TanStack Query patterns in agent-detail.tsx

// Query: template's assigned skills
const { data: tmplSkillsData, refetch: refetchSkills } = useQuery({
  queryKey: ['template-skills', templateIdForLookup],
  queryFn: () => api<{ skills: TemplateSkillRow[] }>(`/api/admin/templates/${templateIdForLookup}/skills`),
  enabled: !!templateIdForLookup && !isInstance,
});

// Mutation: attach skill
const attachSkill = useMutation({
  mutationFn: (skillId: string) =>
    api(`/api/admin/templates/${templateIdForLookup}/skills`, { method: 'POST', json: { skill_id: skillId } }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['template-skills', templateIdForLookup] }),
});

// Mutation: detach skill
const detachSkill = useMutation({
  mutationFn: (skillId: string) =>
    api(`/api/admin/templates/${templateIdForLookup}/skills/${skillId}`, { method: 'DELETE' }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['template-skills', templateIdForLookup] }),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| skills_text JSONB on agent_templates | template_skills junction table | Phase 31 | Junction table is canonical; skills_text deprecated |
| All assigned skills injected | Top 3 by relevance score | Phase 33 | Preview must use same score threshold |
| Agent skill effectiveness only | Template aggregated effectiveness | Phase 34 | Endpoint already exists, UI needs to surface it properly |
| No quality scoring | quality_score + quality_tier on skills | Phase 36 | Badge component ready to use |

**What does NOT exist yet (must be built):**
- `is_mandatory` and `assignment_rationale` columns on `template_skills`
- CRUD endpoints for template skill assignments
- Preview endpoint
- Template-view skills tab in `agent-detail.tsx`

---

## Open Questions

1. **Where to put the skill assignment "search to add" UI**
   - What we know: skills list has 207 skills — a searchable dropdown is needed
   - What's unclear: use a full-screen modal picker or an inline combobox?
   - Recommendation: Use an inline `Input` + filtered dropdown list (no modal) — keeps the authoring flow focused. Filter against the full skills list already fetched by the skills studio. A simple `<select>` or combobox with search filtering is sufficient.

2. **Rationale field: editable inline or separate edit dialog?**
   - What we know: `assignment_rationale` is a short explanatory text per skill assignment
   - What's unclear: edit-in-place (contenteditable) vs click-to-edit vs always-editable input
   - Recommendation: Show rationale as muted text below skill name; click to edit inline with a small Input that blurs on Enter. Keeps the table compact.

3. **Mandatory vs optional: runtime behavior implication**
   - What we know: `is_mandatory` is stored in DB but `selectSkills()` in the Brain does not read it yet
   - What's unclear: Phase 37 is a UX phase — should it also wire mandatory into the selector?
   - Recommendation: Store the flag in Phase 37, but defer selector behavior change to Phase 38 (Adaptive Agent Context) where runtime injection is revisited. Display mandatory skills with a lock icon to communicate intent without changing runtime behavior yet.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (spec.js files) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/projects/porter/tests && npx playwright test template-skill-ux.spec.js` |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TUX-01 | Template detail shows assigned skills with rationale | smoke (browser) | `npx playwright test template-skill-ux.spec.js --grep TUX-01` | Wave 0 |
| TUX-02 | Attach/detach/reorder skills on template | smoke (browser) | `npx playwright test template-skill-ux.spec.js --grep TUX-02` | Wave 0 |
| TUX-03 | Mandatory/optional toggle + rationale editable | smoke (browser) | `npx playwright test template-skill-ux.spec.js --grep TUX-03` | Wave 0 |
| TUX-04 | Effectiveness section shows aggregated data | smoke (browser) | `npx playwright test template-skill-ux.spec.js --grep TUX-04` | Wave 0 |
| TUX-05 | Preview returns ranked skills for sample prompt | API + smoke | `npx playwright test template-skill-ux.spec.js --grep TUX-05` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/projects/porter/tests && npx playwright test template-skill-ux.spec.js`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/template-skill-ux.spec.js` — covers TUX-01 through TUX-05
- [ ] Uses `http://127.0.0.1:5175` as ADMIN base URL, matching `skill-pack-explorer.spec.js` pattern
- [ ] Test constant: `const TEST_TEMPLATE = 'eng-backend-dev'` — has 2 assigned skills in `template_skills`

---

## Sources

### Primary (HIGH confidence)
- Direct DB inspection (`\d template_skills`, `\d skills`, `\d persona_skills`) — schema verified live
- `admin/backend/src/routes/templates.ts` — confirmed existing endpoints and gaps
- `backend/src/services/skill-selector.ts` — confirmed `scoreSkill()` pure function signature
- `admin/frontend/app/routes/agent-detail.tsx` — confirmed `isInstance`/`hasApi` guards and tab system

### Secondary (MEDIUM confidence)
- `admin/frontend/package.json` — confirmed no DnD library installed
- Phase 33/34/35/36 SUMMARY files — confirmed what was built and what is still missing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed in package.json
- Architecture: HIGH — all patterns verified from existing codebase code
- Pitfalls: HIGH — derived from direct code inspection of guard conditions and table schema
- DB migration needs: HIGH — confirmed by live `\d template_skills` showing missing columns

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, no fast-moving dependencies)
