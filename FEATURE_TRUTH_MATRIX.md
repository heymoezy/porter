# Porter FEATURE_TRUTH_MATRIX

Date: 2026-02-26
Purpose: Trust audit of all user-visible features.
Status legend: ✅ Working | ⚠️ Partial | ❌ Broken | 🧪 Hidden/Preview

## Scoring rubric
- **Working**: primary flow succeeds without workaround; state and feedback accurate.
- **Partial**: some subflows work but edge cases or observability are weak.
- **Broken**: control exists but does not perform expected action reliably.

---

## 1) Locations
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| Device list load | ✅ Working | Loads via `/api/locations` and renders in Locations panel | Claude | Keep |
| Mesh status label | ✅ Working | Header label reflects tailscale availability cache | Claude | Keep |
| Manual refresh | ✅ Working | Refresh button triggers status + locations reload | Claude | Keep |
| First-time no-mesh onboarding | ⚠️ Partial | Basic state messaging exists; guided checklist depth still limited | Lobster | Improve copy/steps |
| Local-only fallback clarity | ⚠️ Partial | Mentioned in copy but not consistently enforced across all flows | Lobster | Tighten state handling |

## 2) Agents
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| Agent cards render correctly | ✅ Working | Two-column alphabetical card layout present | Lobster | Keep |
| Usage bars / risk labels | ✅ Working | Per-card bars/risk states render and refresh | Lobster | Keep |
| Per-agent threshold override | ✅ Working | `set_warn_threshold` path implemented and persisted | Lobster | Keep |
| Configure button opens workspace | ✅ Working | Full-pane configure mode now opens and closes correctly | Lobster | Keep |
| Test button (true roundtrip) | ❌ Broken | Current `test_connection` is heartbeat/telemetry inference, not hello↔ack | Claude | Hide as "Connectivity check" or implement roundtrip |
| Rotate key / Disconnect modals | ✅ Working | In-product modal confirmations implemented | Lobster | Keep |

## 3) Configure Workspace
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| File switching works | ✅ Working | Left-nav file clicks now switch editor content reliably | Lobster | Keep |
| Unsaved-change prompt | ✅ Working | Save/discard prompts on switch/close | Lobster | Keep |
| Active file highlight | ✅ Working | Selected file highlighted in navigator | Lobster | Keep |
| Find in file | ✅ Working | Inline find box + enter-to-find in current file | Lobster | Keep |
| Scope relevance of file list | ⚠️ Partial | Agent-family scoping implemented; project/global/source grouping not complete | Claude | Complete v0.13 scope grouping |
| Scope badge clarity (global/project/agent) | ❌ Broken | No persistent source badge/legend yet in file rows | Claude | Implement before v0.13 cut |

## 4) Memory
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| Global memory behavior | ✅ Working | Global memory files exist and are writable | Lobster | Keep |
| Project memory isolation | ❌ Broken | Project-scoped memory model is planned but not implemented | Claude | Implement v0.13 Phase D |
| Session memory flush behavior | ❌ Broken | No deterministic session flush pipeline yet | Claude | Implement in PEP v1.1 addendum |
| Provenance/source tracking | ⚠️ Partial | Audit exists, but scope-source/chain provenance not fully enforced | Claude | Extend audit schema |

## 5) PEP/1 / Remote Execution
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| Agent register | ✅ Working | `/pep/v1/agent/register` implemented in hub + agent | Claude | Verify E2E |
| Agent heartbeat | ✅ Working | `/pep/v1/agent/heartbeat` updates online state | Claude | Verify timeout windows |
| list/read/write/mkdir/delete ops | ✅ Working | Agent + hub FS handlers present in `porter-agent.py` and `porter.py` | Claude | Add acceptance tests |
| Error model consistency | ⚠️ Partial | Some endpoints standardized; global consistency not yet complete | Claude | Normalize envelope across APIs |
| Loop safeguards | ❌ Broken | correlation/idempotency/hop/breaker not fully implemented end-to-end | Claude | Implement Phase 1 contract |

## 6) Tasks & Schedules
| Feature | Status | Evidence | Owner | Action |
|---|---|---|---|---|
| Create schedule | ⚠️ Partial | UI + API exist; reliability unclear from operator outcomes | Claude | Validate and harden |
| Persist schedule | ⚠️ Partial | Schedule persistence endpoint exists; durability semantics unclear | Claude | Add explicit persistence checks |
| Trigger on schedule | ❌ Broken | Operator reports schedules/tasks do not execute reliably | Claude | Rebuild scheduler execution path |
| Run logs visible | ⚠️ Partial | Some task endpoints/log surfaces exist, but not trusted UX | Lobster | Improve observability UI |
| Retry/backoff behavior | ❌ Broken | No verified retry/backoff guarantees in current scheduler path | Claude | Implement with tests |

---

## Hide/Preview decisions (mandatory)
List any controls that must be hidden or marked preview due to Broken status:

- Replace **Test** button label with **Connectivity check (preview)** until true hello↔ack roundtrip is implemented.
- Hide or badge **Schedules auto-run** as Preview until trigger/retry reliability is verified.
- Hide scope-sensitive controls that imply project isolation until project/session layering is live.

---

## Sign-off
- Auditor: Lobster (initial pass)
- Date: 2026-02-26
- Approved for next phase (Y/N): Y (with hide/preview actions enforced)
