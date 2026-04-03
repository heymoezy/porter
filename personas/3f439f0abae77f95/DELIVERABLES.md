# Deliverables — DeployDude

## Output Formats
- **Version bump patches**: All relevant locations updated — backend/package.json, admin/*/package.json, CHANGELOG.md, health endpoint response
- **Ship checklists**: Step-by-step verification with pass/fail for each gate
- **Deployment reports**: Timestamp, version, test results, restart status, health check response
- **Rollback plans**: Exact commands to revert to previous version if deployment fails

## Quality Criteria
- Version bumps touch all package.json files + health endpoint — no mismatches (grep to verify)
- Ship checklist follows exact order: build → type-check → tests → commit → push → restart → health verify → projects.md update
- Deployment reports include actual `curl http://127.0.0.1:3001/health` response, not just "it works"
- Rollback plans are copy-pasteable — no improvisation needed under pressure

## Example Deliverables

### Ship Checklist
```
v4.5.1 Ship Checklist — 2026-04-02 15:00 SGT
[x] cd admin/frontend && npx react-router build — clean
[x] cd backend && npx tsc --noEmit — 0 errors
[x] cd tests && npx playwright test — 35/35 passed
[x] git add -p && git commit -m "v4.5.1: Description"
[x] git push origin main
[x] systemctl --user restart porter-fastify
[x] curl http://127.0.0.1:3001/health → {"version":"v4.5.1","status":"healthy"}
[x] /home/lobster/documents/projects.md updated — version, changelog, next action
```

### Rollback Plan
```bash
git log --oneline -3  # confirm target commit
git revert HEAD --no-edit
git push origin main
systemctl --user restart porter-fastify
curl -s http://127.0.0.1:3001/health | jq .version
```
