# Claude UI Execution Checklist

## Step 1: Config foundation
- [ ] Define config schema for locations/agents/permissions/preferences
- [ ] Implement migration from legacy roots
- [ ] Add config validation

## Step 2: Onboarding wizard
- [ ] Build first-run setup flow screens
- [ ] Implement test connection actions
- [ ] Persist setup state and completion

## Step 3: Settings tabs
- [ ] Locations tab CRUD
- [ ] Agents tab CRUD + key rotation
- [ ] Permissions matrix tab
- [ ] Memory/runtime/security tabs (v1 controls)

## Step 4: Permission enforcement
- [ ] Enforce role + namespace checks on runtime/memory endpoints
- [ ] Add clear error messages for denied actions

## Step 5: Upload UX cleanup
- [ ] Remove forced Uploads root default
- [ ] Keep Upload button contextual in writable dirs
- [ ] Optional user-added Uploads location

## Step 6: Tests
- [ ] Migration tests
- [ ] Wizard flow tests
- [ ] Permission enforcement tests
- [ ] Regression tests for existing file operations

## Step 7: Docs
- [ ] Update user docs with setup walkthrough
- [ ] Add admin docs for agent key lifecycle
