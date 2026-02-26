# Porter Release Notes

## v0.12.71 (2026-02-26)

### UX + Operations
- Locations: added Devices header controls with mesh status, last-updated timestamp, and manual refresh action.
- Files: free-space/item context moved into a persistent bottom footer outside the scrollable file list.
- Agents: default view now prioritizes production agents and hides internal/test entries unless explicitly toggled.

### Usage + Guardrails
- Unified usage telemetry directly in each agent card.
- Added low-capacity progress bars, risk states, and per-card refresh action.
- Fixed usage null/0 handling and corrected remaining-capacity semantics.
- Added global + per-agent low-capacity warning thresholds that actively drive risk coloring.

### Operator Configuration
- Reworked technical controls into user-friendly language for setup/routing/memory/risk/approval.
- Added persistent operator preference controls in Agents module and save/refresh behavior via `/api/preferences`.

---

## v0.12.70 (2026-02-26)

- PEP/1 Phase 0 complete:
  - iPhone connect flow switched to client-first browser access guidance.
  - Non-iOS connect flow reframed to capability-first language.
  - SSH probe errors normalized into structured envelope (`code`, `message`, `retryable`).
  - Retry-aware SSH failure modal behavior.
  - Node connectivity state now tri-state (`online`, `relay`, `offline`).
  - 15s frontend request timeout enforcement to prevent hanging spinners.

---

## Notes
- These release notes are additive and intended for operator-facing tracking.
- For detailed historical entries, see in-app "What's new" changelog in `porter.py`.
