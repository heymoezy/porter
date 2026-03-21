# Deferred Items — Phase 08

## Out-of-scope issues found during execution

### Playwright tests fail due to SSH tunnel binding mismatch

**Found during:** Task 2 verification (regression check)
**Issue:** 35 Playwright tests connect to `http://127.0.0.1:8877/login` but porter.py listens on `[::1]:8877` (IPv6 via SSH tunnel). `ss -tlnp` confirms IPv4 `127.0.0.1:8877` is not listening.
**Pre-existing:** Yes — no code changes caused this. The tests were failing before 08-01 began.
**Resolution:** Not this plan's responsibility. The Playwright tests cover porter.py (legacy), not the Fastify backend (port 3001) being built in v2.0.
**Owner:** Infrastructure / porter.py migration phase.
