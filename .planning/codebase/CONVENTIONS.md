# Coding Conventions

**Analysis Date:** 2026-03-20

## Naming Patterns

**Files:**
- TypeScript components: PascalCase for React components (`ChatView.tsx`, `ProjectsView.tsx`)
- TypeScript utilities/hooks: camelCase (`useChat.ts`, `useFileSystem.ts`)
- Python modules: snake_case (`porter.py`)
- Constants in Python: UPPER_SNAKE_CASE (`PORTER_PORT`, `DEFAULT_PREFERENCES`)

**Functions:**
- React components/exports: PascalCase (`function ChatView()`, `export function Sidebar()`)
- React hooks: camelCase starting with `use` (`useChat()`, `useTasks()`)
- TypeScript utility functions: camelCase (`sendMessage()`, `handleSend()`)
- Python private functions: leading underscore (`_porter_data_dir()`, `_db_init()`)
- Python internal helpers: double underscore prefix reserved for Python internals

**Variables:**
- TypeScript: camelCase (`activeTab`, `isStreaming`, `setInput`)
- Python: snake_case (`_wf_registry`, `default_preferences`)
- React state: camelCase (`isLoading`, `isProjectLoading`, `isStreaming`)
- HTML/CSS class names: kebab-case (`module-title`, `persona-card`, `mnav-label`)

**Types:**
- TypeScript interfaces: PascalCase (`AppState`, `Message`)
- Type unions: PascalCase (`TabId = 'chat' | 'orchestration'`)
- Python type hints: Use built-in types and string literals

## Code Style

**Formatting:**
- TypeScript: Prettier (inferred from ESLint setup)
- Python: No explicit formatter configured; follows stdlib conventions
- Indentation: 2 spaces (TypeScript), 4 spaces implied (Python)
- Line length: No strict limit detected, but keep readable

**Linting:**
- TypeScript: ESLint + TypeScript ESLint plugin
- Config: `frontend/eslint.config.js` — uses flat config style
- Rules: Extends recommended configs for JS, TS, React hooks, React refresh
- Ignores: `/dist` directory

## Import Organization

**Order (TypeScript):**
1. React and external libraries (useState, lucide-react)
2. Custom hooks (from `../../hooks/`)
3. Utilities (from `../../lib/`)
4. Stores/state (from `../../store/`)
5. CSS/assets (if needed)

**Example from `ChatView.tsx`:**
```typescript
import { useState } from 'react';
import { Send, History, BrainCircuit, Loader2 } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
```

**Path Aliases:**
- Relative imports: `../../hooks/`, `../../lib/`, `../../store/`
- No path aliases configured (uses relative imports throughout)

**Python imports:**
- Standard library first (email, hashlib, json, logging, etc.)
- No external packages (stdlib only)
- Imports at top of file with brief comments for sections

## Error Handling

**TypeScript Patterns:**
- Try-catch in async operations (SSE handling, API calls)
- Console.error for debugging: `console.error('SSE Parse Error:', e)`
- EventSource error handling: `eventSource.onerror` callbacks
- Graceful fallbacks: `tasks?.filter()`, `project?.name || 'default'`
- Early returns on loading/error states

**Example from `useChat.ts`:**
```typescript
try {
  const eventSource = new EventSource(url);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) throw new Error(data.error);
    } catch (e) {
      console.error('SSE Parse Error:', e);
    }
  };
  eventSource.onerror = (e) => {
    console.error('SSE Connection Error:', e);
    eventSource.close();
  };
} catch (error) {
  console.error('Chat Error:', error);
}
```

**Python Patterns:**
- Broad try-except for non-critical operations (best-effort fallback)
- Specific exception types when action depends on cause
- Log errors with context: `log.error("message: %s", exception)`
- Silent failures for optional features: `except Exception: pass`
- Three-level severity: `log.info()`, `log.warning()`, `log.error()`, `log.debug()`

**Example from `porter.py`:**
```python
try:
  import urllib.request
  with urllib.request.urlopen(req, timeout=4) as resp:
    ip = resp.read().decode().strip()
except Exception as e:
  log.debug("Parse skip: %s", e)
  continue
```

## Logging

**Framework:** Python `logging` module (stdlib)

**Patterns:**
- Initialize once at top: `log = logging.getLogger("porter")`
- Format: `"  [%(levelname)s] %(message)s"`
- Levels used:
  - `log.info()` — actionable events (migrations, feature toggles)
  - `log.warning()` — recoverable issues (FTS5 setup failed)
  - `log.error()` — failures with context
  - `log.debug()` — best-effort skips, internal state

**Usage example:**
```python
log.info("Backfill: migrated %d milestone(s) from title→name", migrated_count)
log.warning("FTS5 setup failed: %s", error_msg)
log.debug("Ignored: %s", exception_detail)
```

## Comments

**When to Comment:**
- Section headers with ASCII dividers (80 chars, e.g., `# ── Logging setup ──`)
- Complex logic that isn't obvious from code
- Migration/data transform intent
- Side effects or dependencies

**JSDoc/TSDoc:**
- Minimal; TypeScript interfaces are self-documenting
- React components: No JSDoc headers detected
- Functions: Optional — type signatures provide clarity

**Style:** Inline comments with `#` (Python) or `//` (TS); avoid block comments

## Function Design

**Size:**
- React components: 10–100 lines (view logic + JSX)
- Hooks: 15–80 lines (state + handlers)
- Utility functions: 5–40 lines

**Parameters:**
- Keep to 3–4 params max; use objects for complex config
- Optional params at end or as destructured defaults
- Python: Use `_` prefix for internal params (e.g., `_col, _def = [...]`)

**Return Values:**
- React components: Single JSX root element
- Hooks: Return object with state + handlers (consistency with Zustand pattern)
- Functions: Single value or object with named properties

**Example from `useChat.ts`:**
```typescript
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const sendMessage = useCallback(async (prompt: string, model: string, chatId?: string) => { ... }, []);
  return { messages, isStreaming, sendMessage, setMessages };
}
```

## Module Design

**Exports:**
- Named exports for functions/components: `export function ChatView() { ... }`
- Default exports rarely used
- One primary export per file (+ supporting types if needed)

**Barrel Files:**
- No barrel exports (`index.ts`) detected
- Direct imports from component files

**Store Pattern (Zustand):**
- Define interface: `interface AppState { ... }`
- Create with `create<AppState>((set) => ({ ... }))`
- Export hook: `export const useAppStore = create<AppState>(...)`
- Access: `const { activeTab, setActiveTab } = useAppStore()`

**Hook Composition:**
- Hooks call other hooks freely
- No custom middleware layer
- React Query for server state (`useQuery`, `useMutation`)

---

*Convention analysis: 2026-03-20*
