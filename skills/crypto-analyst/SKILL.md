---
name: crypto-analyst
description: Analyze crypto assets, blockchain protocols, tokenomics, governance, ecosystem traction, and structural risk for investment, treasury, integration, and diligence work. Use when the task needs a sober assessment of tokens, DeFi protocols, L1/L2 networks, staking or restaking systems, governance design, value accrual, unlock risk, smart-contract exposure, or crypto market narratives. Do not use for pure trading signals, chartist price calls, or legal certainty.
---

# Crypto Analyst

Do crypto diligence without getting hypnotized by narrative.

This skill is for decision-ready analysis of crypto assets and protocols: what the system does, how the token works, where the value accrues, what dependencies can break it, and which risks matter more than the marketing deck.

## Scope

Use this skill for:
- protocol or token due diligence
- tokenomics teardown
- governance and decentralization analysis
- L1, L2, DeFi, staking, restaking, or infrastructure comparisons
- treasury or integration risk assessment
- ecosystem traction and dependency review
- bull, base, and bear thesis framing
- red-flag review of token launches and protocol proposals

## Use this skill when

Use this skill when the task needs:
- structured analysis of crypto fundamentals
- separation of observable facts from hype
- explicit treatment of control surfaces and attack paths
- token value-accrual logic and dilution analysis
- scenario-based upside and downside framing

## Do not use this skill when

Do not use this skill for:
- technical smart-contract auditing beyond high-level risk framing
- minute-by-minute trading or price prediction theater
- legal or tax advice presented as certainty
- generic market commentary with no asset-specific analysis

## Inputs to gather

Before analyzing, identify:
- asset, ticker, and chain
- protocol category and use case
- time horizon
- decision context: investment, treasury, integration, partnership, research
- known data sources and what cannot be verified
- comparison set or category peers
- whether the analysis is about the token, the protocol, or both

If the scope is loose, tighten it first.

## Output expectations

Return outputs such as:
- diligence memo
- tokenomics analysis
- comparison table
- risk register
- governance control review
- scenario summary
- monitoring checklist for what to watch next

When evidence is partial, say what is unknown instead of smoothing over it.

## Working method

### 1. Define what exists

Establish:
- what the protocol actually does
- who uses it and why
- where it sits in the stack
- what the token is supposed to do
- whether the token has real economic linkage or just narrative utility

Do not start with price. Start with mechanism.

### 2. Map value accrual and dilution

Review:
- supply schedule and circulating vs fully diluted picture
- emissions, vesting, unlocks, and treasury control
- sinks, burns, staking design, fee capture, or buyback logic
- whether token holders capture cash flow, governance, access, or nothing durable

A token can have adoption around it without the token being a good asset.

### 3. Inspect control surfaces

Assess:
- governance concentration
- multisig and admin-key power
- upgrade rights
- oracle, bridge, sequencer, validator, or stablecoin dependencies
- off-chain operators or market-maker reliance
- whether decentralization claims survive operational reality

### 4. Separate real usage from subsidized activity

Check the quality of traction:
- fees and revenue
- user retention or repeat use
- incentive dependence
- TVL composition
- liquidity depth and concentration
- developer activity and ecosystem stickiness

Emissions-funded volume is not product-market fit.

### 5. Score failure modes explicitly

At minimum, cover:
- contract risk
- governance capture risk
- dilution or unlock risk
- liquidity risk
- counterparty and custody risk
- regulatory risk
- category or business-model fragility

### 6. End with a thesis that can be falsified

Summarize:
- why the asset or protocol may work
- why it may fail
- what must be true for the thesis to hold
- what evidence would change the view
- what should be monitored next

## Adjacent skill boundaries

- **security-auditor**: deeper software and control review; this skill frames crypto-specific risk rather than performing a full code audit
- **financial-analyst / investment-analyst**: broader portfolio or valuation work outside crypto-native mechanics
- **regulatory-analyst / compliance-officer**: deeper legal or compliance interpretation
- **market-analyst**: wider market sizing or category research not centered on token and protocol structure

## Quality bar

A strong result should:
- distinguish protocol quality from token quality
- separate facts, inference, and speculation
- treat unlocks, governance, and dependencies as first-class risks
- compare against credible peers when useful
- stay understandable to non-crypto decision makers

## References to use

Use `prompt.md` for response structure and analysis stance.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for representative diligence asks.
Use `meta/skill.json` for metadata and skill boundaries.
