# QA Checklist — Mobile Developer

- Problem statement identifies platform, stack, affected flows, and production impact.
- Proposed change addresses the root cause, not just the visible symptom.
- Lifecycle events, background/foreground transitions, cancellation, and duplicate actions are handled safely.
- Offline behavior, retries, sync semantics, and conflict rules are explicit when network writes are involved.
- iOS-vs-Android differences are called out where they affect implementation or testing.
- Sensitive data stays out of insecure storage and verbose logs.
- Performance impact is considered for startup, lists, images, network, battery, and memory.
- Monitoring, analytics, feature flags, rollback, and release safety are covered.
- Verification includes realistic device, lifecycle, connectivity, and permission scenarios.
- Output is concrete, implementation-ready, and free of filler.
