# Porter Remediation Plan
## Fix current UX/config issues before adding new features

## Context
Recent implementation delivered backend capabilities, but user experience is below expectation.
Priority now is to fix the current product quality and flow before building additional roadmap features.

---

## Founder feedback to address (must-fix)
1. Account password change flow is wrong (requires current password; too much friction for single-user owner mode).
2. Account page consumes too much vertical space and feels inefficient.
3. Add Location flow is unclear and disconnected from real-world setup.
4. No clear device connection model ("connect another computer" concept missing).
5. Tailscale awareness/integration is not visible in UI.
6. Existing backend config is hidden from users (not exposed in settings).
7. Permissions tab feels useless at this stage.
8. Sidebar lacks collapse/hamburger mode, wasting workspace area.
9. Overall usability quality below expected standard.

---

## Product decision for this sprint
**Freeze net-new features.**
Do not add new product surfaces until UX remediation is complete and accepted.

Allowed work:
- UI restructuring
- settings clarity
- auth/flow improvements
- Tailscale/device connection UX
- exposing existing backend configuration

Not allowed now:
- new mission-control modules
- new scheduling optimizers
- speculative advanced features

---

## Remediation workstreams

## Workstream A — Account UX cleanup
### A1. Password flow redesign
Support two modes:
1. **Owner mode (single-user local)**
   - require only new password + confirm password
   - no current password prompt
2. **Shared mode (multi-user enabled later)**
   - require current password + new + confirm

Add visible helper text:
- explain why mode differs
- enforce minimum policy and mismatch feedback

### A2. Page density improvements
- compact card layout
- reduce oversized avatar section
- move display settings to separate subsection/tab
- improve spacing and scannability

Acceptance:
- account page should fit key controls above fold on standard laptop viewport.

---

## Workstream B — Locations and device model
### B1. Replace generic "Add location" with guided options
Location creation should begin with type selection:
- Local folder
- This VPS paths (quick picks)
- Remote device via Tailscale
- GitHub repository (disabled/coming soon state allowed)

### B2. Add "Connect Device" first-class flow
Before adding remote paths, user should connect device.
Flow:
1. Add device (name)
2. Choose connection method (Tailscale/SSH/manual)
3. Test connectivity
4. Expose available roots
5. Select roots to mount in Porter

### B3. Surface existing backend roots
- show currently active roots with source and writability
- show whether root came from legacy migration/hardcoded/default
- allow edit/remove with safeguards

Acceptance:
- user can understand where each location comes from and whether it is local, remote, or migrated.

---

## Workstream C — Tailscale awareness and controls
### C1. Add Tailscale status panel in Settings
Display:
- Tailscale enabled/disabled
- current tailnet node name
- reachable peers count
- last connectivity check

### C2. Add connection actions
- Test Tailscale reachability
- Copy join instructions
- Mark peer as trusted device

### C3. Fallback clarity
If Tailscale unavailable:
- show actionable fallback (SSH/manual)
- do not fail silently

Acceptance:
- user can discover and configure remote-device connectivity without backend editing.

---

## Workstream D — Permissions tab repositioning
### D1. Replace current static matrix tab behavior
Current tab is informative but low value now.

Interim approach (before collaboration launch):
- rename tab to **Access Model**
- keep concise explanation of roles
- link role assignment actions directly to Agents tab
- hide advanced namespace matrix behind "Advanced" toggle

### D2. If collaboration not enabled
- show "Single-user mode active" note
- simplify wording to avoid enterprise complexity

Acceptance:
- tab feels useful and context-appropriate, not dead weight.

---

## Workstream E — Navigation and workspace efficiency
### E1. Collapsible sidebar
- add hamburger toggle in top-left on desktop + mobile
- support collapsed icon-only state
- remember user preference

### E2. Main area expansion
- when collapsed, file list gets max width
- settings panel respects full-width layouts

Acceptance:
- user can maximize file workspace with one click.

---

## Workstream F — Settings transparency
Expose current backend-effective config in UI (read/write where safe):
- active locations and path mappings
- default root
- auth mode
- runtime defaults (checkpoint interval, lease ttl)
- agent registry summary

Add "export config" action for diagnostics.

Acceptance:
- no critical operational setting remains "hidden backend magic".

---

## UX quality bar (new)
Before accepting remediation, Claude must provide:
1. before/after screenshots for each remediated section
2. short usability rationale per change
3. responsive behavior notes
4. no regression report for existing file operations

---

## Execution sequence (strict)
1. Workstream E (navigation efficiency)
2. Workstream A (account flow + compactness)
3. Workstream B (locations + connect device model)
4. Workstream C (tailscale awareness)
5. Workstream D (permissions/access model cleanup)
6. Workstream F (settings transparency)

Rationale:
- immediate usability gains first, then structural setup clarity.

---

## Acceptance checklist
- [ ] Password flow updated for owner mode and works as expected
- [ ] Account page compact and efficient
- [ ] Add location flow is guided and intuitive
- [ ] Device-first connection model exists
- [ ] Tailscale status/actions visible in UI
- [ ] Existing backend config exposed in settings
- [ ] Sidebar can collapse/expand with preference saved
- [ ] Permissions area no longer feels useless/noisy
- [ ] Existing file workflows pass regression tests

---

## Instruction to Claude Code
Implement this remediation plan before net-new features. Keep changes backward compatible and do not break current file management operations.
