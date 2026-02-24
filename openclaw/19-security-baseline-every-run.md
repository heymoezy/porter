# Security Baseline — Required on Every Claude Run

## Purpose
Apply low-friction security controls every run so risk does not accumulate between milestone reviews.

## Every-run checks (mandatory)
1. Secrets handling
- no hardcoded credentials/tokens in source
- redact sensitive values in logs/UI output

2. Permission scope
- least privilege for new endpoints/actions
- deny-by-default for privileged operations

3. Auditability
- privileged actions generate audit events
- actor, timestamp, action, target recorded

4. Safe defaults
- no insecure default toggles shipped enabled
- risky features behind explicit opt-in

5. Input/file safety
- validate inputs server-side
- enforce upload safety constraints where applicable

6. Release discipline
- version and changelog updated for each completed run

## Milestone deep reviews (separate)
- pre-alpha
- pre-beta
- pre-public launch

These include broader threat modeling and red-team style checks.
