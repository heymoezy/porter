# Unified cross-project RELEASE SYSTEM — Porter-enforced (council-ratified 2026-07-08)

> Moe: "a proper release system built into all projects, same pattern: smoke/regression tests, local git, version bump, changelog, github push, announce ceremony ... one of the features of porter is to ensure release consistency across all projects."
> Council: codex + grok converged (agy empty). Design below is the synthesis.

## Ratified architecture
- **ONE SOURCE OF TRUTH: Porter owns `release-kit`** — a CLI (`porter-release`) + manifest schema + project registry + gate core + announce adapter + drift/consistency checks. Repos never invent ceremony.
- **Each repo carries `release.manifest.json`** (committed): declares project, kind, versionFile path, changelog path, releaseFeed path, test.smoke/test.regression script names, deploy script, announce {mode,kind,endpoint}, githubRemote, defaultBranch, kitVersion (pin).
- **Per-repo git hooks are THIN SHIMS** (core.hooksPath=deploy/git-hooks, <=30 lines) that call `porter-release gate pre-commit` / `porter-release run post-commit`. NOT copied logic — copied FILES fork (that is exactly what broke: ymc auto-announced, porter didn't). A shared BINARY + registry check cannot silently diverge.
- **Announce SOT stays ymc `lib/release-announce.ts`** (the only sender: Tom voice / WhatsApp / idempotent markers), reached via POST /api/v1/admin/announce-release. Porter NEVER reimplements announce; intake `kind`s grow (add themozaic|baanyindee later).
- **Enforcement = Porter registry + `release:audit`**: registry holds projects[], lastRelease[], hookFingerprint[], kitVersion pin; a periodic Porter check flags DRIFT (hooks unwired / bypassing kit / stale kitVersion / release inconsistency) and reports it. This is what "Porter ensures release consistency across all projects" means concretely.
- **Ceremony order (uniform):** smoke/regression tests PASS -> version bump + changelog (gated at pre-commit, refused if missing) -> local commit -> github push -> deploy (project-specific) -> announce -> register with Porter.
- **Shared vs project-specific:** SHARED = gate contract, version/changelog/announce mechanics, registry, audit. PROJECT-SPECIFIC (declared in manifest) = versionFile/changelog paths, test scripts, deploy script, announce kind.

## Build plan (small, sequential, each shippable; never break live ymc/porter releases)
- **R1** release-kit skeleton in Porter: manifest schema + project-registry + `porter-release gate` (pre-commit contract) + `porter-release run` (test->push->announce->register) + HTTP announce adapter (reuse the path just built). Unit-test against a throwaway manifest.
- **R2** Porter registry API + `release:audit` (drift detection: hook fingerprint, kitVersion pin, last-release consistency) + a report surface.
- **R3** migrate ymc to the kit: replace bespoke deploy/git-hooks with thin shims + release.manifest.json; keep deploy.sh + smoke as the declared scripts. Verify a real ymc release still tests->bumps->announces identically.
- **R4** migrate Porter to the kit (replace the v6.71 mirrored hook with the shim).
- **R5** themozaic + baanyindee adopt: release.manifest.json + thin shims + test:smoke script; announce deferred (add kinds later).
- **R6** Porter admin surface: release-consistency view across all 4 repos (last release, drift status).

## Raw council responses
### codex
```
**Architecture**
```text
ONE SOURCE OF TRUTH:
  Porter repo owns: @porter/release-system

Contains:
  release-core/
    project-registry.ts
    release-manifest.schema.ts
    git-hooks/
      pre-commit
      post-commit
    cli.ts
    announcers/
      ymc-http-announcer.ts
      noop-announcer.ts
    checks/
      hook-drift.ts
      release-consistency.ts

Each project owns only:
  porter.release.json
  project-specific npm scripts
```

**Per-Project Manifest**
```json
{
  "project": "ymc.capital",
  "kind": "ymc-platform",
  "versionFile": "src/version.ts",
  "changelog": "CHANGELOG.md",
  "releaseFeed": "src/site-releases.ts",
  "test": {
    "smoke": "npm run smoke",
    "regression": "npm run test:regression"
  },
  "deploy": "npm run deploy:local",
  "announce": {
    "mode": "ymc-http",
    "endpoint": "https://ymc.capital/api/v1/admin/announce-release"
  },
  "githubRemote": "origin",
  "defaultBranch": "main"
}
```

**Porter Registry**
```ts
export const projects = [
  "ymc.capital",
  "porter",
  "themozaic",
  "baanyindee"
] as const;
```

Porter owns the registry and validates every repo against it.

**Release Command**
```bash
porter-release release
```

Executes, in order:

```text
1. run smoke tests
2. run regression tests
3. verify version bump exists
4. verify changelog entry exists
5. verify optional release feed entry exists
6. create local git commit
7. push to GitHub
8. run deploy/restart if configured
9. run post-release smoke if configured
10. announce ceremony
11. write idempotent local + Porter release marker
```

**Git Hook Contract**
```text
core.hooksPath = .porter/hooks
```

Hooks are thin wrappers only:

```bash
#!/usr/bin/env bash
npx porter-release hook pre-commit
```

```bash
#!/usr/bin/env bash
npx porter-release hook post-commit
```

No project keeps custom release logic in hooks.

**Pre-Commit Refuses**
```text
REFUSE if code/config/runtime files changed and no version bump
REFUSE if no changelog entry for bumped version
REFUSE if project requires release feed and entry missing
REFUSE if porter.release.json is missing or invalid
REFUSE if hook checksum != Porter registry checksum
REFUSE if release kind is unknown
REFUSE if staged version does not match changelog version
```

**Post-Commit Runs**
```text
For normal commits:
  verify commit metadata only

For release commits:
  push to GitHub
  deploy/restart if configured
  run post-release smoke if configured
  announce ceremony if configured
  write release marker
  report release result to Porter
```

Important: full release order is owned by `porter-release release`, not raw git. Hooks enforce that manual commits cannot bypass the contract.

**Shared vs Project-Specific**
```text
SHARED:
  manifest schema
  version/changelog validation
  hook installation
  hook drift detection
  git commit/push flow
  release marker/idempotency
  announce ceremony contract
  Porter reporting
  consistency dashboard/checks

PROJECT-SPECIFIC:
  smoke command
  regression command
  deploy/restart command
  version file path
  changelog path
  release feed requirement
  announce mode
```

**Announcement Modes**
```text
ymc.capital:
  ymc-http announcer -> existing shared release-announce.ts

porter:
  ymc-http announcer -> POST /api/v1/admin/announce-release kind=porter

themozaic:
  noop announcer for R1
  ymc-http or project announcer later

baanyindee:
  noop announcer for R1
  ymc-http or project announcer later
```

**Porter Enforcement**
```text
Porter owns:
  project registry
  expected hook checksum
  manifest schema version
  last known release per project
  release status reports
  drift reports
```

**Porter Verifies**
```text
For each repo:
  porter.release.json exists
  manifest schema version is current
  core.hooksPath == .porter/hooks
  hook wrapper checksum matches Porter
  package.json has standard scripts or manifest commands
  latest git tag/version/changelog agree
  latest release marker agrees with GitHub head
  last successful announcement exists when announce mode != noop
```

**Drift Detection**
```text
porter-release audit --all
```

Reports:

```text
HOOK_DRIFT
MANIFEST_MISSING
MANIFEST_SCHEMA_OLD
VERSION_CHANGELOG_MISMATCH
UNPUSHED_RELEASE
UNANNOUNCED_RELEASE
FAILED_SMOKE
FAILED_REGRESSION
UNKNOWN_RELEASE_KIND
RELEASE_MARKER_MISSING
```

Porter exposes:

```text
GET /api/v1/admin/releases/status
POST /api/v1/admin/releases/report
POST /api/v1/admin/releases/audit
```

**R1: Extract Without Behavior Change**
```text
Goal:
  ymc and porter keep working.

Build:
  create @porter/release-system
  add manifest schema
  add CLI skeleton
  add announcer adapter for existing ymc HTTP endpoint
  import current ymc/porter hook rules into shared core
  install generated hooks in ymc + porter

Ship:
  ymc release still announces exactly as today
  porter release still announces through existing POST endpoint
```

**R2: Standard Manifest + Audit**
```text
Goal:
  Porter can see drift.

Build:
  add porter.release.json to ymc, porter, themozaic, baanyindee
  add Porter registry
  add porter-release audit
  add hook checksum validation
  add release status report endpoint

Ship:
  audit reports all 4 projects
  themozaic/baanyindee may show announce=noop, not failure
```

**R3: Release Orchestrator**
```text
Goal:
  canonical release command exists.

Build:
  implement porter-release release
  enforce order:
    tests -> version -> changelog -> commit -> push -> deploy -> smoke -> announce
  support dry-run
  support --no-push only for emergency/local mode
  write release marker

Ship:
  ymc and porter can use CLI voluntarily
  hooks still protect manual commits
```

**R4: Migrate Themozaic + Baanyindee Gates**
```text
Goal:
  bare repos get same release discipline.

Build:
  add version file if missing
  add CHANGELOG.md if missing
  add smoke/regression npm scripts
  install .porter/hooks
  set announce.mode=noop

Ship:
  releases require tests/version/changelog/git/push
  no announce ceremony yet
```

**R5: Porter Dashboard / Scheduled Audit**
```text
Goal:
  Porter actively enforces consistency.

Build:
  scheduled audit job
  release status API
  alert/report output
  failing drift state visible in Porter admin

Ship:
  Porter reports which repos are compliant, stale, or broken
```

**R6: Announce Ceremony Expansion**
```text
Goal:
  themozaic + baanyindee join ceremony later.

Build:
  add release kind support
  enable announce.mode=ymc-http or new project announcer
  add idempotent announcement markers

Ship:
  all 4 projects complete same release ceremony
```

**Final Rule**
```text
No repo owns release behavior.

Repos own:
  manifest + project commands

Porter owns:
  release system + hooks + registry + audit + enforcement
```
```
### grok
```
I'll inspect the existing release hooks, announcer, and Porter layout so the architecture matches what you already have.Inspecting the live ymc and Porter release machinery next.# RELEASE SYSTEM — Architecture + Build Plan

## 0. Decision summary (one line each)

| # | Decision |
|---|----------|
| **SOT** | **Porter owns `release-kit`** (CLI + contract schema + registry API). Repos never invent ceremony. |
| **Announce SOT** | **ymc `release-announce.ts` remains the only sender** (Tom voice / WhatsApp / markers). Porter never reimplements announce. |
| **Hook model** | Each repo: `core.hooksPath=deploy/git-hooks` → thin shims → **`porter-release`** binary from kit. |
| **Enforcement** | Porter registry + periodic `release:audit` job + hard refuse on incomplete ceremony. |
| **Order** | `test → (version+changelog already in commit) → push → deploy? → announce → register`. |

---

## 1. Source of truth (a)

```
┌─────────────────────────────────────────────────────────────┐
│  PORTER  :3001                                              │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │ release-kit      │  │ registry (DB / storage)         │  │
│  │  - CLI           │  │  projects[], lastRelease[],     │  │
│  │  - gate core     │  │  hookFingerprint[], drift[]     │  │
│  │  - schema        │  │                                 │  │
│  └────────┬─────────┘  └─────────────────────────────────┘  │
│           │ POST /api/v1/admin/releases/*                    │
└───────────┼──────────────────────────────────────────────────┘
            │                              │
            │ invoke CLI                   │ announce only via
            ▼                              ▼
   each repo thin hooks              ymc :5182
   + release.manifest.json           POST /api/v1/admin/announce-release
                                     → lib/release-announce.ts
                                     kinds: ymc-platform|tom|porter|themozaic|baanyindee
```

**ONE thing that may not drift:**  
`porter/release-kit` version pinned in each repo’s `release.manifest.json` (`kitVersion`).  
If hooks call local bash that bypasses kit → Porter audit flags DRIFT.

**Not SOT (adapters only):**  
- per-repo `deploy/git-hooks/{pre,post}-commit` (≤30 lines, call kit)  
- per-repo `scripts/smoke*` / `deploy.sh`  
- ymc announce *delivery* (sender stays ymc; intake kinds grow)

**Why this, not “copy hooks into each repo”:**  
That’s what broke (ymc had post-commit announce; Porter didn’t). Shared *files* still fork. Shared *binary + registry check* cannot silently diverge.

---

## 2. Artifacts per repo

```
release.manifest.json          # REQUIRED, committed
deploy/git-hooks/pre-commit    # thin → porter-release gate pre-commit
deploy/git-hooks/post-commit   # thin → porter-release run post-commit
src|site|backend …/version*    # project-specific path (declared in manifest)
CHANGELOG / releases array     # project-specific path (declared in manifest)
package.json scripts:
  "test:smoke": "..."          # REQUIRED name
  "test:regression": "..."     # optional; if present, must pass on release
```

### `release.manifest.json` (schema)

```jsonc
{
  "projectId": "ymc" | "porter" | "themozaic" | "baanyindee",
  "kitVersion": "1.x.y",                    // must match installed kit
  "announceKind": "ymc-platform" | "porter" | "themozaic" | "baanyindee" | null,
  "version": {
    "file": "site/app/lib/version.ts",      // or backend/package.json, etc.
    "pattern": "export const VERSION = 'X.Y.Z'"  // extractor rule id
  },
  "changelog": {
    "files": ["site/app/routes/admin/layout.tsx", "backend/src/lib/site-releases.ts"],
    "requireVersionInDiff": true
  },
  "codeGlobs": ["backend/src/**", "site/app/**", "..."],
  "hooks": {
    "preCommit": ["gate:version-changelog", "gate:project-extra?"],
    "postCommit": ["test:smoke", "deploy?", "git:push?", "announce", "registry:record"]
  },
  "scripts": {
    "smoke": "test:smoke",                  // npm script name (standard)
    "regression": "test:regression",        // optional
    "deploy": "deploy.sh"                   // optional; null = no deploy step
  },
  "announce": {
    "enabled": true,                        // themozaic/baan: false until later
    "via": "ymc-http",                      // only allowed value today
    "endpoint": "http://127.0.0.1:5182/api/v1/admin/announce-release"
  },
  "push": {
    "enabled": true,
    "remote": "origin",
    "branch": "main"                        // or current branch policy
  }
}
```

---

## 3. Gate contract (c)

### PRE-COMMIT — `porter-release gate pre-commit`  
**REFUSES (exit 1) if any fail:**

| # | Rule | Shared? |
|---|------|---------|
| P0 | `release.manifest.json` present + schema-valid + `kitVersion` matches CLI | SHARED |
| P1 | staged paths match `codeGlobs` ⇒ version file staged **and** semver increased | SHARED (paths from manifest) |
| P2 | new version string appears in **every** `changelog.files` diff | SHARED |
| P3 | any `SKIP_*` requires `SKIP_REASON`; append audit log; report skip to Porter on next record | SHARED |
| P4 | project extras (ymc: CHECKPOINT, tom-version, docs-fresh) | PROJECT (plugin scripts listed in manifest) |

**Does NOT:** bump version, write changelog, run tests, push, announce.

### POST-COMMIT — `porter-release run post-commit`  
**ORDER (hard, sequential; stop on hard-fail):**

| Step | Action | Fail policy |
|------|--------|-------------|
| 1 | Detect version bump in HEAD (else exit 0 no-op) | — |
| 2 | `npm run test:smoke` (+ `test:regression` if defined) | **HARD** — no announce, registry=`failed:tests` |
| 3 | Optional `scripts.deploy` (ymc deploy.sh / restarts) | **HARD** for projects that declare it |
| 4 | Optional `git push` (if `push.enabled`) | **HARD** if enabled; soft-skip only with `SKIP_PUSH=1` + reason |
| 5 | If `announce.enabled`: POST ymc announce-release (idempotent) | **HARD** log + registry=`failed:announce` (marker still ymc-side) |
| 6 | `POST Porter /api/v1/admin/releases/record` {projectId, version, sha, steps[], kitVersion} | always |

**Shared vs project-specific:**

| Concern | Owner |
|---------|--------|
| step order, refuse rules, SKIP audit, registry record | **kit (Porter)** |
| version file format / multi-file changelog | **manifest** |
| smoke/regression commands | **project npm scripts** |
| deploy/restart/Caddy | **project deploy.sh** |
| announce render + WhatsApp + markers | **ymc release-announce** |
| whether announce runs yet | **manifest.announce.enabled** |

**Corrected note on Moe order vs git:**  
Version bump + changelog happen *before* commit (human/agent). Pre-commit *enforces* them. Post-commit runs tests→push→announce. A single CLI `porter-release ship` can also do bump→changelog→commit→same post path for non-interactive ships later (R4+).

---

## 4. Porter enforcement meaning (b)

**“Porter ensures release consistency” = three concrete jobs:**

### B1 — Registry (truth of last known good)
```
projects: ymc | porter | themozaic | baanyindee
lastRelease: { version, gitSha, kitVersion, announcedAt|null, steps: {...}, status }
expected: { hooksPath, announceKind, announceEnabled, smokeScript }
```

### B2 — Audit (drift detection) — `porter-release audit` + Porter cron (~15m / on admin)
For each registered local path in Porter config:

| Check | Drift signal |
|-------|----------------|
| `git config core.hooksPath` == `deploy/git-hooks` | `hooks.unwired` |
| pre/post-commit exist + first-line invokes `porter-release` | `hooks.bypassed` / `hooks.legacy` |
| `release.manifest.json` present, schema ok | `manifest.missing` |
| installed kit semver == manifest.kitVersion == Porter minKit | `kit.stale` |
| package.json has `test:smoke` | `scripts.smoke.missing` |
| last git version tag/file vs registry lastRelease | `registry.behind` / `orphan.commit` |
| announce.enabled but no record with announcedAt for last version | `announce.skipped` (**the bug class**) |
| project commit with code globs but no version bump in history window | `ceremony.missing` |

**Report:** Porter admin surface + optional Tom/Porter staff message daily digest of open DRIFT items.  
**Not soft forever:** after R3, `release:audit` failure is a Porter health red for that project.

### B3 — Intake gate on record
`POST /releases/record` **rejects** (4xx) if:
- smoke step not `ok`
- kitVersion < Porter `minKitVersion`
- announce.enabled && announce step not ok/skipped-idempotent

So a project can commit locally but **cannot claim “released”** in Porter without full ceremony.

---

## 5. Tests plug-in (d)

| Convention | Rule |
|------------|------|
| **Required** npm script name: `test:smoke` | kit always runs this on version-bump post-commit |
| **Optional** `test:regression` | if key exists in package.json, kit runs it after smoke |
| Manifest may override names under `scripts.*` but default = those two | keep greppable |
| Exit 0 = pass; stdout captured into registry record | |
| ymc today: wrap `scripts/postdeploy-verify.sh` (smoke-tom + phoenix) as `test:smoke` | adapter, not fork |
| porter: health + minimal API smoke | |
| themozaic/baan: minimal `curl localhost` / build check until real suites exist | |

---

## 6. Package layout (buildable)

```
Porter/
  packages/release-kit/           # publishable as file: or workspace
    package.json                  # bin: porter-release
    src/
      cli.ts                      # gate | run | audit | ship | init
      schema.ts                   # release.manifest.json zod
      gate/pre-commit.ts
      run/post-commit.ts
      adapters/version.ts         # extractors: ts-const | package-json
      adapters/announce-ymc.ts    # HTTP POST only
      adapters/registry.ts        # POST Porter record
      audit/local.ts
  backend/src/routes/v1/admin/
    releases.ts                   # record + list + audit-report
  storage/release-registry/       # or DB table release_events
```

**Install per repo:**
```bash
# release.manifest.json kitVersion pin
npm i -D file:../Porter/packages/release-kit   # or path in monorepo policy
git config core.hooksPath deploy/git-hooks
```

Thin hook:
```bash
#!/usr/bin/env bash
exec npx porter-release gate pre-commit "$@"
```

---

## 7. Migration R1…R7 (each shippable; no break live ymc/porter)

| Rev | Ship | Touch | Risk control |
|-----|------|-------|--------------|
| **R1** | Extract **announce kinds registry** + document contract; add kinds stubs `themozaic`/`baanyindee` (disabled). No hook changes. | ymc `release-announce.ts` + route allowlist | existing ymc/porter announce unchanged |
| **R2** | Land `packages/release-kit` in Porter with `gate pre-commit` + `run post-commit` + schema. Unit tests on gate only. **No repo wiring.** | Porter only | zero prod impact |
| **R3** | Porter API: `POST/GET /api/v1/admin/releases/*` + minKitVersion + audit endpoint. Admin list last releases. | Porter | read-mostly |
| **R4** | **Porter adopts kit** (replace current post-commit that only watches package.json). Add pre-commit version+changelog gate for Porter. Manifest `announce.enabled=true`. Dual-run: kit announce path = existing HTTP. | Porter hooks + version/changelog files | keep `announce-porter-update.ts` as thin wrapper called by kit adapter |
| **R5** | **ymc adopts kit** behind flag `PORTER_RELEASE_KIT=1` default **on** after 1 green ship. Thin-wrap existing gates (checkpoint/tom/docs as `projectExtra[]`). post-commit: kit orchestrates verify→announce→record; deploy.sh still project deploy. | ymc hooks only become shims | SKIP escape hatch; if kit missing → fail closed with message, not silent skip |
| **R6** | **themozaic + baanyindee**: `porter-release init`, manifest, version file, changelog, `test:smoke` stub, hooks wired, **`announce.enabled=false`**, push optional. Registry records local releases. | those 2 repos | no WhatsApp noise |
| **R7** | Porter cron/timer `release:audit` all 4 paths; staff digest on drift; bump `minKitVersion` when breaking kit changes. Enable announce for mozaic/baan when ready (manifest flip + kind copy). | Porter ops | announce later = one-line manifest + kind header |

**Non-break rules:**
- R1–R3: additive only  
- R4–R5: one project at a time; ceremony outcome identical (same announce endpoint + markers)  
- Never delete ymc `release-announce.ts`  
- Never put WhatsApp send inside Porter  
- `SKIP_*` remains but always audited + visible in registry  

---

## 8. End-state flow (all 4 projects)

```
dev stages code
  → pre-commit: porter-release gate  (version+changelog or REFUSE)
  → commit
  → post-commit: porter-release run
       → npm run test:smoke [(+ regression)]
       → [deploy.sh if declared]
       → [git push if enabled]
       → [ymc announce if enabled]     ──┐
       → Porter registry record        ──┴── if announce.enabled && !announced → DRIFT on audit
```

**Drift that used to break production (“ymc announced, porter didn’t”) now surfaces as:**  
`announce.skipped` / missing `releases/record` for porter last version within N minutes of version bump — Porter’s problem to show red, not tribal memory.

---

## 9. Explicit non-goals (this design)

- Not a multi-package npm publish to public registry (path/file dep fine until R7+)  
- Not moving Tom/WhatsApp into Porter  
- Not unifying deploy targets (Caddy vs systemd stay project-local)  
- Not requiring monorepo merge of the 4 products  

---

## 10. First code slice (if building tomorrow)

1. `Porter/packages/release-kit` skeleton + zod schema + `gate pre-commit` for `package-json` + `ts-const` extractors  
2. Porter `releases.record` route + storage  
3. Point **Porter** post-commit at kit (R4) — smallest live twin of ymc  
4. Only then shim ymc (R5)

**SOT name to put in CLAUDE.md / Porter PROJECT.md:**  
`release-kit @ Porter` is the ceremony brain; `release-announce @ ymc` is the mouth; `release.manifest.json @ each repo` is the adapter.
```
