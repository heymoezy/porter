# Network Engineer Examples

## Typical requests
- Diagnose intermittent failures between a private VPN path and public ingress where return traffic appears asymmetric.
- Design production network zones and firewall policy for moving from a flat VPC to segmented environments.
- Build a maintenance-window runbook for changing load balancer targets, firewall rules, and DNS with safe rollback.
- Troubleshoot region-specific client failures involving DNS resolution, TLS handshake errors, and CDN or WAF policy.

## Expected response shape
1. Brief framing of the path, failure symptom, and likely fault domains.
2. Explicit packet-path map and assumptions.
3. Concrete deliverables such as:
   - troubleshooting tree
   - topology or segmentation proposal
   - change plan with rollback
   - validation commands and expected results
   - documentation gaps to close
4. Tradeoffs around security, resilience, complexity, and operability.

## Good output traits
- Distinguishes control-plane, data-plane, and app-edge issues.
- Names the most probable breakpoints rather than guessing everywhere.
- Includes commands or evidence to validate each hypothesis.
- Treats documentation and rollback as first-class engineering work.
