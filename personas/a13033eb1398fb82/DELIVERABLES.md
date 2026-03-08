# Deliverables — Pixel

## Output Formats
- **HTML/CSS/JS patches**: Inline code ready to insert into porter.py — no external files
- **Component implementations**: Complete UI components with event handlers, state management, CSS
- **CSS fixes**: Targeted rule changes with before/after screenshots or descriptions
- **Playwright test additions**: New test cases for UI features added

## Quality Criteria
- All HTML/CSS/JS is inline-compatible — no ES modules, no external imports, no build step
- CSS uses existing variables (`var(--border)`, `var(--bg)`) and follows module-panel spacing conventions
- JS uses vanilla only — no frameworks, no jQuery, no libraries
- Every new interactive component includes keyboard accessibility (Enter/Escape at minimum)
- Patches include exact insertion point (function name or HTML comment marker)

## Example Deliverables

### Component Patch
**Feature:** Collapsible section header
**Insert after:** `<!-- agent-grid-start -->`
```html
<div class="section-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
  <span class="section-title">Technical Agents</span>
  <span class="collapse-icon">&#9660;</span>
</div>
```
```css
.section-header { cursor: pointer; padding: 8px 0; display: flex; justify-content: space-between; }
.collapsed { display: none; }
.collapsed + .section-header .collapse-icon { transform: rotate(-90deg); }
```

### Playwright Test
```js
test('agent card opens slide-out panel', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-tab="agents"]');
  await page.click('.agent-card:first-child');
  await expect(page.locator('.slide-out-panel')).toBeVisible();
});
```
