---
phase: 1
slug: legal-identity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x (unit) + Playwright 1.x (E2E) |
| **Config file** | none — Wave 0 installs vitest.config.ts and playwright.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose tests/auth/` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/auth/`
- **After every plan wave:** Run `npx vitest run && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | AUTH-01 | integration | `npx vitest run tests/auth/singpass.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | AUTH-02 | unit | `npx vitest run tests/auth/fhd2h.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | AUTH-03 | unit | `npx vitest run tests/auth/workpermit.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | AUTH-04 | unit | `npx vitest run tests/auth/insurance.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | AUTH-05 | integration | `npx vitest run tests/auth/uen.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | AUTH-06 | unit | `npx vitest run tests/auth/contract.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/auth/singpass.test.ts` — SingPass MyInfo v5 OAuth flow stubs
- [ ] `tests/auth/fhd2h.test.ts` — FHD2H cert upload and verification stubs
- [ ] `tests/auth/workpermit.test.ts` — MOM work permit check stubs
- [ ] `tests/auth/insurance.test.ts` — per-shift insurance activation stubs
- [ ] `tests/auth/uen.test.ts` — UEN/ACRA business verification stubs
- [ ] `tests/auth/contract.test.ts` — contract acceptance and versioning stubs
- [ ] `src/lib/test-utils/mockpass-setup.ts` — shared MockPass helper
- [ ] Vitest + Playwright installation via Wave 0 plan (01-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SingPass redirect + consent screen | AUTH-01 | External SingPass sandbox required | 1. Navigate to signup 2. Click "Verify with SingPass" 3. Verify redirect to sandbox 4. Complete consent 5. Verify data returned |
| FHD2H cert image upload quality | AUTH-02 | Visual inspection of upload UX | 1. Upload valid cert photo 2. Verify preview renders 3. Upload invalid file type 4. Verify rejection message |
| Poaching clause acknowledgment UX | AUTH-06 | Legal language review | 1. Start restaurant onboarding 2. Verify separate poaching clause screen 3. Verify explicit checkbox required 4. Verify cannot proceed without acceptance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
