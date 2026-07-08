# R3 — migrate ymc onto release-kit (DELEGATE/compat mode; council codex 2026-07-08)

## Decision: wrap, don't replace. Zero-regression.
- ymc release.manifest.json: run.mode=delegate → kit shim calls ymc's EXISTING post-commit logic (deploy.sh etc); gate.mode=delegate-with-shadow → calls ymc's EXISTING pre-commit; announce.mode=none (ymc announce stays authoritative — NO double announce); register=audit-only (Porter learns ymc is wired without changing behavior); deploy/verify/push = delegate (do NOT reorder). Do NOT retire ymc bespoke logic in R3.
- tom-version rule: first-class manifest field conditionalVersionFiles (path-prefix → required version file), not hardcoded in Porter.
- PROVE-BEFORE-FLIP: run porter-release gate/run --dry alongside a real ymc release; confirm identical effect (tests, version/changelog enforced, deploy+verify+announce ONCE each) BEFORE removing/replacing ymc bespoke hooks. Rollback at each step.
- ORDER note: codex + safety say prove kit on greenfield (themozaic) is an option, but delegate-mode makes ymc low-risk since behavior is unchanged.

## Raw codex
```
**Decision**

- Lower risk: `ymc` adopts R3 in **compat/delegate mode**.
- Keep `deploy.sh` / existing rich post-commit path as the production executor.
- Set `announce.mode=none` for `ymc`; the existing ymc announce remains authoritative.
- Do not let R3 reorder `push/deploy/verify/announce`.
- Do not retire ymc bespoke deploy logic in R3. Absorb it later only after several clean releases.

**R3 Kit Requirements**

Add these before touching ymc hooks:

```json
{
  "run": {
    "mode": "delegate",
    "delegateCommand": ["bash", "deploy/git-hooks/post-commit.ymc"],
    "push": { "mode": "delegate" },
    "deploy": { "mode": "delegate" },
    "verify": { "mode": "delegate" },
    "announce": { "mode": "none" },
    "register": { "mode": "audit-only" }
  },
  "gate": {
    "mode": "delegate-with-shadow",
    "delegateCommand": ["bash", "deploy/git-hooks/pre-commit.ymc"]
  }
}
```

Important: delegate to the **old post-commit wrapper**, not blindly to `bash deploy.sh`, unless `deploy.sh` already contains the full current branch logic:

- `site/` changed → build, rsync, restart `ymc-site` + `ymc-backend`, verify, announce
- backend-only → restart `ymc-backend`, verify, announce
- tom paths → also handle `tom-service` / `openclaw-gateway`

**tom-version Rule**

Make this first-class in the manifest, not hardcoded in Porter:

```json
{
  "gate": {
    "conditionalVersionFiles": [
      {
        "id": "ymc.tom-version",
        "whenChanged": [
          "tom-*",
          "tom-*/**",
          "backend/**/tom/**",
          "backend/**/openclaw/**"
        ],
        "requireChangedFromHead": [
          "backend/src/lib/tom-version.ts"
        ],
        "message": "tom-related changes require backend/src/lib/tom-version.ts"
      }
    ]
  }
}
```

If the current ymc rule checks more than “file changed” and requires a semantic bump, make the rule:

```json
"requireBump": [{ "file": "backend/src/lib/tom-version.ts", "parser": "semver-or-local-regex" }]
```

**Gate Parity Before Flip**

1. Rename current hooks, do not delete them:

```bash
mv deploy/git-hooks/pre-commit deploy/git-hooks/pre-commit.ymc
mv deploy/git-hooks/post-commit deploy/git-hooks/post-commit.ymc
```

2. Add R3 shims in a separate path:

```bash
mkdir -p deploy/git-hooks-r3
```

`deploy/git-hooks-r3/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
porter-release gate --manifest release.manifest.json
```

`deploy/git-hooks-r3/post-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
porter-release run --manifest release.manifest.json
```

3. Build a parity matrix in a throwaway worktree. For each staged diff, run both:

```bash
bash deploy/git-hooks/pre-commit.ymc > /tmp/old.log 2>&1; echo $? > /tmp/old.code
porter-release gate --manifest release.manifest.json > /tmp/new.log 2>&1; echo $? > /tmp/new.code
diff -u /tmp/old.code /tmp/new.code
```

Required fixtures:

- site change, no version bump → both fail
- site change, version only → both fail
- site change, version + What’s New only → both fail if release feed missing
- site change, version + What’s New + `site-releases.ts` → both pass
- backend-only release diff → same result
- tom path without `tom-version.ts` → both fail
- tom path with `tom-version.ts` → both pass
- docs/non-release-only diff → same result as today

Do not flip hooks until exit codes match on every fixture.

**Run Parity Before Flip**

Instrument both paths to emit normalized JSON traces:

```bash
porter-release run --manifest release.manifest.json --dry-run --trace-json /tmp/kit-run.json
```

Existing ymc post-commit should emit, or be wrapped to emit:

```json
[
  "detect-changed-files",
  "build",
  "rsync-client",
  "restart:ymc-site",
  "restart:ymc-backend",
  "verify:tom-smoke",
  "verify:phoenix",
  "verify:scheduler-manifest",
  "announce:ymc-release-announce"
]
```

Pass criteria before flip:

- kit dry-run shows exactly one delegate execution
- kit trace contains no kit-native announce
- kit trace contains no kit-native push unless ymc already does that
- ymc trace contains exactly one announce
- release announce audit shows one release row for the version
- Porter `/api/admin/releases/audit` reports no drift

**First Real ymc R3 Release**

Keep old hooks available. Flip only local repo hook path:

```bash
git config core.hooksPath deploy/git-hooks-r3
```

Expected production behavior:

- pre-commit: R3 shim → `porter-release gate` → old ymc gate authoritative
- post-commit: R3 shim → `porter-release run` → old ymc post-commit authoritative
- announce happens once, from ymc deploy path
- deploy/verify ordering unchanged

Rollback:

```bash
git config core.hooksPath deploy/git-hooks
```

No code rollback needed if old hook files were preserved.

**Order**

1. Ship R3 compat features in Porter release-kit.
2. Prove full native kit flow on `themozaic.com` first.
3. Dogfood on Porter if lower operational risk than ymc.
4. Migrate ymc last, initially delegate-only.
5. After 2-3 clean ymc releases, consider moving only the gate to manifest-native.
6. Leave ymc deploy/verify/announce delegated until a separate R4 migration.

**Do Not Do In R3**

- Do not replace `deploy.sh`.
- Do not let Porter announce ymc releases.
- Do not require new per-release files beyond ymc’s current version / What’s New / release feed / tom-version rules.
- Do not run old post-commit and kit-native run side effects in the same live release.
```
