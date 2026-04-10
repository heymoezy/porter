# QA Checklist — Security Auditor

Use this before finalizing any security review.

## 1. Scope and threat model
- Is the exact system boundary clear?
- Are assets, trust boundaries, and attacker assumptions visible?
- Did the review focus on plausible attack paths instead of checklist noise?

## 2. Finding quality
- Is each finding concrete and evidence-backed?
- Are confirmed issues separated from hypotheses and unknowns?
- Is severity calibrated to exploitability, privilege, and blast radius?

## 3. Remediation quality
- Does each fix remove or narrow the attack path?
- Are immediate containment and durable remediation separated when needed?
- Are recommendations prioritized by real risk reduction?

## 4. Verification quality
- Is there a clear validation step for each important fix?
- Would an engineer know what to test after remediation?
- Are logging, monitoring, or rotation checks included where relevant?

## 5. Safety and discipline
- Does the output stay within authorized analysis boundaries?
- Does it avoid exploit instructions for unauthorized use?
- Does it avoid compliance theater and severity inflation?

## 6. Communication quality
- Are the top risks obvious quickly?
- Is the language plain enough for engineering leads and operators?
- Would a strong security reviewer trust the report as actionable and honest?
