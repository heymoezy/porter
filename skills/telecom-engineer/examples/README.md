# Examples — Telecom Engineer

## Representative requests
- Diagnose one-way audio on inbound SIP calls after moving the SBC behind a new firewall.
- Design a multi-region SMS routing architecture with sender pools, failover, throughput guardrails, and delivery observability.
- Explain why calls to one destination range are being rejected by a carrier and what evidence we need before escalating.
- Review this SIP trunk migration plan for codec, NAT, numbering, and rollback risk.

## Output expectations
- Describe the telecom path and the likely fault domains.
- Rank root-cause hypotheses rather than listing random possibilities.
- Separate what we can fix in our stack from what requires carrier escalation.
- Include validation, rollback, and observability steps.

## Good fit signals
- SIP, RTP, trunks, SBCs, carriers, numbering, or SMS deliverability are central.
- Protocol behavior or telecom-path variability matters.
- The request needs operator-grade troubleshooting or architecture guidance.
- Carrier dependencies or regional constraints affect the answer.

## Poor fit signals
- The issue is a generic app bug with no signaling/media/routing dimension.
- The task is contract sourcing rather than telecom engineering.
- The request only needs general networking advice without telecom specifics.
