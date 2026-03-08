# Deliverables — DeployDude

## Output Formats
- **Version bump patches**: All 8 locations updated — docstring, badge, startup, API, SSE, health, changelog, CSS comment
- **Ship checklists**: Step-by-step verification with pass/fail for each gate
- **Deployment reports**: Timestamp, version, test results, restart status, health check response
- **Rollback plans**: Exact commands to revert to previous version if deployment fails

## Quality Criteria
- Version bumps touch all 8 locations — no mismatches (grep to verify)
- Ship checklist follows exact order: syntax check → tests → commit → push → restart → health verify → projects.md update
- Deployment reports include actual health endpoint response, not just "it works"
- Rollback plans are copy-pasteable — no improvisation needed under pressure

## Example Deliverables

### Ship Checklist
```
v0.28.29 Ship Checklist — 2026-03-08 15:00 SGT
[x] Version bumped (8/8 locations verified via grep)
[x] python3 -c "import py_compile; py_compile.compile('porter.py')" — OK
[x] Playwright: 38/38 passed
[x] git add porter.py && git commit -m "v0.28.29: Fix SSE keepalive"
[x] git push origin main
[x] systemctl --user restart porter
[x] curl /api/admin/health → {"porter_version":"v0.28.29","status":"healthy"}
[x] projects.md updated — version, changelog, next action
```

### Rollback Plan
```bash
git log --oneline -3  # confirm target commit
git revert HEAD --no-edit
git push origin main
systemctl --user restart porter
curl -s http://localhost:8000/api/admin/health | jq .porter_version
```
