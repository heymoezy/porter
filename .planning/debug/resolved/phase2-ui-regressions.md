---
status: resolved
trigger: "Investigate and fix all UI regressions introduced during Phase 2 (Memory V2) execution. Multiple things are broken."
created: 2026-03-20T12:00:00+08:00
updated: 2026-03-20T17:30:00+08:00
---

## Current Focus

hypothesis: CONFIRMED - cortex deletion removed non-cortex functions + memory feed SQL references missing column
test: restored all deleted functions/vars + fixed SQL, ran 35 Playwright tests
expecting: all 35 tests pass
next_action: version bump and commit

## Symptoms

expected: All tabs work, agents show cards, memory shows feed, models connect, no JS errors
actual: 7 broken areas - agents tab shows projects, memory badge/feed mismatch, scope dropdown unstyled, project detail tabs empty, _connectModelSSE undefined, 7 Playwright failures
errors: _connectModelSSE is not defined
reproduction: Click AI Agents tab, click Memory tab, click Models tab, run Playwright tests
started: After Phase 2 (Memory V2) execution

## Eliminated

## Evidence

- timestamp: 2026-03-20T17:10:00+08:00
  checked: grep for _connectModelSSE definition
  found: function called at line 32639 but never defined - deleted in commit d7389e2
  implication: models tab will throw JS error on load

- timestamp: 2026-03-20T17:11:00+08:00
  checked: grep for _personas variable declaration
  found: used at line 32713 and 22322 but never declared with let/var - deleted in d7389e2
  implication: agents tab and project detail throw ReferenceError, killing tab switching

- timestamp: 2026-03-20T17:12:00+08:00
  checked: git diff d7389e2^..d7389e2 for deleted declarations
  found: _connectModelSSE, _handleModel* (6 funcs), _renderModelCards, _openModelActivity, _closeModelActivity, _pollActivityTrace, _selectModel, _selectModelFromList all deleted. Also persona vars: _personas, _selectedPersonaId, _wizCurrentStep, _wizSelectedEmoji, _personasLoading
  implication: cortex deletion was too aggressive - swept non-cortex model + persona code

- timestamp: 2026-03-20T17:14:00+08:00
  checked: /api/memory/feed endpoint
  found: SQL query selects 'action' column but memories table has no such column
  implication: feed always returns error, shows "No memories yet" despite 91 active records

- timestamp: 2026-03-20T17:25:00+08:00
  checked: Playwright tests after fix
  found: 35/35 pass (was 28/35)
  implication: all 7 regressions resolved

## Resolution

root_cause: Phase 2 plan 02-01 (cortex deletion) removed 374 lines of non-cortex JS code that was interleaved with cortex code in the old file structure. This included model SSE functions (_connectModelSSE + 6 handlers), model UI functions (_renderModelCards, _openModelActivity, _closeModelActivity, _pollActivityTrace, _selectModel, _selectModelFromList), and persona variable declarations (_personas, _selectedPersonaId, _wizCurrentStep, _wizSelectedEmoji, _personasLoading). Additionally, plan 02-04 added a memory feed SQL query referencing a non-existent 'action' column.
fix: Restored all 374 lines of model/persona JS code extracted from git pre-deletion commit. Fixed memory feed SQL to remove 'action' column reference. Python setdefault('action','learned') still adds the field for JS rendering.
verification: 35/35 Playwright tests pass. Memory feed API returns 91 items correctly. All tabs switch without JS errors. Agent cards render. Project detail opens.
files_changed: ["/home/lobster/documents/porter/porter.py"]
