Start from:
`openclaw/16-next-run-instructions-post-ux-release.md`

Then apply constraints from:
`openclaw/12-claude-master-instructions-consolidated.md`

Hard rules:
- Do not break existing Porter file behavior.
- Keep all new features additive and backward compatible.
- Implement pending instructions (UI config exposure, agent permissions, multi-provider usage tracking).
- Return phased progress with tests and risks.

Output each cycle:
1) what was implemented
2) tests and evidence
3) what is pending
4) any blockers requiring founder decision
