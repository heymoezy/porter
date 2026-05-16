# Software Silo — Sealed Seed Directives

Authoritative list of moe-direct (sealed) directives in the `software` silo.
Stored in DB at `directives` table; this file is the source-controlled mirror
for audit/recovery. Insert order is preserved by `priority` (lower = injected first).

The `directive_immutable_moe_direct` DB trigger blocks UPDATE/DELETE on these
rows. To modify: either (1) Moe edits this file + a new INSERT migration runs,
or (2) `SET LOCAL porter.allow_moe_direct_mutation='true'` inside a tx (memory-pruner).

## Active seeds (as of 2026-05-16)

### silo-sw-never-freehand-brand (priority 10) — added 2026-05-16
NEVER freehand visual brand assets. Before touching any logo, icon, favicon,
header mark, or branded SVG: (1) locate the existing source file — look in
assets/, public/, public/assets/, design/, brand/ — and (2) READ it with the
Read tool first. Do not generate SVG path data from memory. Do not guess
proportions, bracket positions, stroke widths, or color hex values. Do not
invent text casing (YMC is uppercase, "capital" is lowercase — verify against
the actual file). If the source asset is not found, ASK Moe where it lives
rather than fabricate. Applies to all software-silo projects.

### silo-sw-design-system — added 2026-05-11
Always create a design system for every new project. Tokens
(color/spacing/typography/radius/shadow) + component library before any screen
is built. Never freehand. Never one-off markup.

### silo-sw-components-only — added 2026-05-11
Always use components. Every UI element is a reusable component instance,
never bespoke per-page markup. If a needed component does not exist, create
it in the component library first, then consume it.

### silo-sw-compact-means-padding — added 2026-05-11
"Compact" / "denser" / "tighter" means reduce vertical padding and gap
spacing. Never shrink font size. Same rule inverse for "looser" / "breathe":
pad up, do not grow the font.

### silo-sw-porter-backbone — added 2026-05-11
Porter is the backbone for every software project. All model calls go through
Bridge. All cross-session memory reads/writes go through Intellect. All agents
come from Forge. No direct provider SDKs, no flat-file mailboxes, no side
channels.

### silo-sw-parallelize-aggressively — added 2026-05-11
Parallelize software work aggressively. Dispatch sub-agents and route to
Codex (via Porter Bridge) for non-competing tasks. Draw the dependency graph
first: same file = sequential, different files / independent research
questions = parallel. Send multiple Task tool blocks in a single message,
not sequentially. Single-threading is the bottleneck.
