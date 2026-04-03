# Deliverables — Pixel

## Output Formats
- **React components**: shadcn/ui-based components in `admin/frontend/app/` — TypeScript, Tailwind CSS 4
- **Component implementations**: Complete UI components with event handlers, state management, Tailwind styles
- **CSS fixes**: Targeted Tailwind/CSS variable changes with before/after descriptions
- **Playwright test additions**: New test cases in `tests/` for UI features added

## Quality Criteria
- All components use shadcn/ui primitives (`Button`, `Card`, `Input`, etc.) — never raw HTML form elements
- CSS uses Tailwind CSS 4 classes + CSS variables (`var(--border)`, `var(--background)`) from the design system
- React 19 — use modern hooks, no legacy patterns, no useEffect for derived state
- Every new interactive component includes keyboard accessibility (Enter/Escape at minimum)
- After every change: `cd admin/frontend && npx react-router build` must pass

## Example Deliverables

### React Component
**Feature:** Collapsible section header
```tsx
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-2 text-sm font-medium"
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
```

### Playwright Test
```js
test('agent card opens detail view', async ({ page }) => {
  await page.goto('/admin/agents');
  await page.click('.agent-card:first-child');
  await expect(page.locator('[data-testid="agent-detail"]')).toBeVisible();
});
```
