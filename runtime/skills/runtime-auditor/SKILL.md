---
name: runtime-auditor
description: Audit Porter runtime health and drift. Use when checking routing pressure, backend failures, scheduler contention, logging coverage, or hidden runtime regressions before users notice them.
---

# Runtime Auditor

Use this skill when Porter needs a runtime health read or an operations-focused diagnosis.

Core rules:
- Prefer evidence from logs, queue metrics, and recent failures.
- Distinguish transient noise from systemic drift.
- Surface operator action, not raw noise.
- Call out missing telemetry explicitly.

Output format:
- `symptom`
- `likely_cause`
- `evidence`
- `risk`
- `next_action`

