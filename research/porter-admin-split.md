# Porter Admin Split — Design Plan
_Source: GPT-5.4 audit, 2026-03-14_

## Core Correction
- Porter = customer-facing workspace app
- Porter Admin = separate company-level SaaS console
- These are different application modes, not tabs

## Role Model (3 tiers)
1. **platform_admin** — PorterHQ only. Manages tenants, billing, global email, support, incidents.
2. **workspace_admin** (role=admin) — Customer account admin inside normal Porter. Manages users, people, tools, project policies, model access for that tenant.
3. **workspace_user** (role=operator) — Normal collaborator/operator/viewer inside Porter.

## Account Plan
- `system/porter` — platform_admin (SaaS control)
- `admin/porter` — workspace_admin (power user)
- `moe/porter` — workspace_user (operator)
- `jacob/porter` — workspace_user (operator)

## Nav Split
**Porter App (users):** Projects, Agents, Models, People, Tools, Settings, Sign Out, version badge
**Porter Admin (/admin/):** Overview, Users, Health, Logs, Audit — separate shell

## Implementation Phases
1. v0.31.50 — Role system + 4 accounts + sign out in nav + nav visibility
2. v0.31.51 — /admin/ shell for platform_admin
3. v0.31.52 — API route protection + clean separation

## Future (not now)
- Email engine (Resend provider adapter + outbox pattern)
- Forgot password / Register UI
- Billing, Customers, Incidents modules
- Bootstrap forced password rotation
