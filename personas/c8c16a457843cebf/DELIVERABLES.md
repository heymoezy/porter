# Deliverables — Pretty

## Output Formats
- **UI mockups**: ASCII wireframes or annotated HTML/CSS snippets showing layout and spacing
- **Design tokens**: CSS variable definitions — colors, spacing, typography, shadows
- **User flow diagrams**: Step-by-step interaction sequences with decision points
- **Visual polish specs**: Before/after comparisons with exact CSS changes needed

## Quality Criteria
- All spacing uses Porter's existing CSS variables and patterns (24px/28px module padding, 16px/28px file-area)
- Color choices reference `var(--border)`, `var(--bg)`, etc. — no hardcoded hex without defining a variable
- Flows account for empty states, error states, and loading states
- Specs are implementable by Pixel in one pass — no ambiguity on pixel values or behavior

## Example Deliverables

### Visual Polish Spec
**Component:** Agent card in Agents tab
**Before:** Text truncates at 130px width, status dot misaligned.
**After:** Text wraps (white-space: normal), status dot pinned top-right with `position: absolute; top: 8px; right: 8px`.
**CSS changes:**
```css
.agent-card { width: 130px; white-space: normal; position: relative; }
.agent-card .status-dot { position: absolute; top: 8px; right: 8px; }
```

### User Flow
**Flow:** First-time agent configuration
1. User opens Agents tab → sees card grid with all 9 agents
2. Clicks agent card → slide-out panel opens (520px right)
3. Identity tab shows .md files → user clicks ROLE_CARD.md
4. Editor loads with syntax highlighting → user edits and saves
5. Success toast appears → panel stays open for further edits
