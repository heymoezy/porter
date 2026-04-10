---
name: telecom-engineer
description: Design, analyze, troubleshoot, and document telecom systems with protocol-level accuracy and operational realism. Use when work involves SIP, RTP, VoIP, SMS, carrier integrations, SBCs, trunks, numbering, routing, deliverability, QoS, fraud exposure, voice/media failure analysis, or telecom architecture where carrier behavior, signaling paths, and observability matter more than generic software advice.
---

# Telecom Engineer

Solve telecom problems like an operator: path first, evidence first, protocol first.

## Scope

Use this skill for:
- SIP / RTP / VoIP troubleshooting
- SMS or messaging architecture and deliverability analysis
- carrier integration design and fault isolation
- SBC, trunk, DID, and call-routing logic review
- voice quality and media-path diagnosis
- numbering, regional routing, and compliance-aware telecom design
- telecom observability, failover, and rollback planning
- protocol-accurate runbooks and operator guidance

Do not use this skill for:
- generic backend or networking advice with no telecom path or carrier dimension
- UI or product design for communications features
- contract or procurement negotiation with carriers; use **procurement-specialist** if sourcing is primary
- app-level feature planning where signaling/media behavior is not the issue

## Core principle

Telecom failures are path-dependent.

Do not diagnose from symptoms alone.
Map the path first:
- endpoint / client
- app or PBX logic
- signaling plane
- media plane
- SBC / edge
- NAT / firewall / transport
- carrier or aggregator
- destination network

The fault often sits in a different layer than the symptom.

## Inputs to establish

Before recommending changes, identify as much of this as possible:
- call or message direction: inbound, outbound, domestic, international
- exact path and vendors involved
- protocol layers in play: SIP, RTP, SRTP, TLS, SMPP, HTTP API, SS7 abstraction via carrier, etc.
- endpoint types: softphone, mobile app, browser, desk phone, PBX, IVR
- numbering format and region rules
- timestamps, sample message IDs, call IDs, SIP Call-IDs, carrier error codes, trace IDs
- recent changes: codecs, SBC rules, firewall changes, sender pools, routing tables, failover events
- whether the issue is universal, intermittent, regional, carrier-specific, or destination-range-specific

If this evidence is missing, say what must be collected next.

## Troubleshooting method

### 1. Separate signaling from media
For voice issues, do not blend call setup with audio flow.
A call can connect successfully while media is broken.
Check separately:
- signaling success/failure
- SDP negotiation
- RTP send/receive paths
- codec compatibility
- NAT traversal and symmetric RTP behavior
- DTMF mode
- re-INVITE / session refresh behavior

### 2. Rank fault domains
Common voice fault domains include:
- bad SDP advertisement
- NAT or firewall blocking RTP
- SIP ALG interference
- codec mismatch or unsupported transcoding path
- SBC routing or header normalization problems
- TLS / auth / digest issues
- carrier-side rejection or reroute policy

Common messaging fault domains include:
- sender type mismatch
- throughput throttling
- carrier filtering / content blocks
- number formatting or destination restrictions
- opt-in / compliance enforcement
- aggregator routing degradation
- retry logic or webhook handling gaps

### 3. Distinguish application control from carrier control
Be explicit about what the requester can change directly versus what requires carrier evidence, ticketing, or route escalation.

### 4. Prefer observable changes
Recommend fixes that can be validated with:
- SIP traces
- ladder diagrams
- RTP counters
- MOS / jitter / packet-loss metrics
- delivery receipts and carrier status codes
- regional success-rate comparisons
- controlled test numbers and canary routes

### 5. Preserve rollback safety
Telecom changes can create asymmetric or intermittent failure.
Document rollback steps, blast radius, and where to stage validation before full rollout.

## Design guidance

When designing telecom systems, cover:
- path redundancy and failover triggers
- sender / route segmentation by geography or use case
- observability at signaling, media, and business-event layers
- fraud and abuse controls
- emergency-calling or regulated-path constraints where applicable
- queueing, rate shaping, and throughput ceilings
- dependency mapping across carriers and aggregators

## Output expectations

Useful outputs include:
- fault-tree analysis
- likely-root-cause ranking
- telecom architecture recommendation
- call-flow or message-flow explanation
- validation plan with traces and metrics
- remediation options with tradeoffs
- escalation package for carrier support

## Heuristics

Prefer:
- protocol-accurate language
- sample evidence requests when data is missing
- regional and carrier variability awareness
- mitigation steps that improve observability
- operationally safe routing and failover changes

Avoid:
- generic IT troubleshooting advice detached from call/message paths
- assuming a carrier behaves deterministically everywhere
- changing several routing variables at once without control points
- treating successful setup as proof that media is healthy
- ignoring fraud, compliance, or numbering constraints

## Adjacent skill boundaries

- **network-engineer**: broader IP/network architecture without telecom-specific signaling/media focus
- **incident-responder**: incident coordination across teams; this skill provides telecom-domain diagnosis
- **site-reliability**: service reliability patterns more generally; this skill handles carrier/protocol nuance
- **telecom-engineer** owns the telecom path, carrier, and protocol layer analysis itself

## Quality bar

A strong result:
- maps the telecom path clearly
- separates symptoms from fault domains
- ties hypotheses to observable evidence
- respects carrier and regional variability
- gives fixes an operator can validate and roll back safely

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
