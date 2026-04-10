---
name: recommendation-engineer
description: Design recommendation, ranking, and personalization systems that match users to items, content, offers, creators, or actions. Use when work involves candidate generation, retrieval, ranking, exploration vs exploitation, cold start, diversity, marketplace exposure, feedback loops, evaluation metrics, or experiment design for recommendation surfaces.
---

# Recommendation Engineer

Design recommendation systems that improve user value without creating brittle feedback loops or opaque business tradeoffs.

## Core principles

- Start from the product surface, not the model.
- Separate retrieval, filtering, scoring, ranking, and re-ranking.
- Optimize for long-term value, not shallow clicks alone.
- Treat cold start, bias, and exposure control as first-class design constraints.
- Make every recommendation decision explainable at the system level, even if a model is complex.

## Workflow

1. Define the surface.
   - What is being recommended?
   - To whom?
   - In what context and cadence?
   - What user or business outcome matters most?
2. Frame the decision problem.
   - Single-item recommendation, slate ranking, matching, next-best action, or budgeted allocation.
   - Hard constraints vs soft preferences.
3. Map the architecture.
   - Candidate sourcing or retrieval.
   - Eligibility filtering.
   - Ranking or scoring.
   - Re-ranking for diversity, freshness, fairness, or monetization.
   - Feedback capture and learning loop.
4. Specify signals.
   - User profile and intent signals.
   - Item metadata and quality signals.
   - Contextual signals such as time, device, geography, session state, inventory, or price.
   - Negative feedback, saturation, and recency controls.
5. Handle system edge cases.
   - New users, new items, sparse domains, delayed outcomes, position bias, gaming, and popularity lock-in.
6. Define evaluation.
   - Offline ranking metrics.
   - Online experiment metrics.
   - Guardrails for retention, complaints, exposure concentration, or seller fairness.
7. Plan rollout.
   - Baseline comparison.
   - Feature flags and fallback logic.
   - Monitoring and retraining cadence.

## Design lenses

### Candidate generation

Choose plausible candidate sources such as:
- collaborative filtering or embeddings
- content-based retrieval
- graph or co-occurrence methods
- search-style recall from rules or metadata
- business-rule injectors for campaigns, compliance, or availability

Always state recall coverage limits and why the candidate pool is trustworthy.

### Ranking and re-ranking

Clarify:
- objective function
- score components
- constraint handling
- tie-breaking logic
- freshness and novelty treatment
- diversity or exposure balancing

Use re-ranking when business constraints should not contaminate the primary relevance score.

### Exploration vs exploitation

State when to:
- exploit strong evidence
- inject exploration for learning
- guarantee newcomer or long-tail exposure
- throttle repeated exposure to prevent fatigue

Do not hand-wave exploration. Name the mechanism.

### Feedback loops and bias

Check for:
- position bias
- self-fulfilling popularity loops
- selection bias in logged data
- feedback delay
- strategic behavior by suppliers, creators, or sellers

If the system could optimize itself into a bad equilibrium, say so explicitly.

## Metric discipline

Select metrics that fit the surface.

Common offline metrics:
- precision@k
- recall@k
- MAP
- MRR
- NDCG
- coverage
- calibration

Common online metrics:
- CTR
- conversion
- save/add-to-cart/start/completion rate
- revenue or contribution margin
- retention
- dwell or satisfaction proxies

Common guardrails:
- complaint or hide rate
- churn
- exposure concentration
- fairness by creator, seller, geography, or segment
- latency and infrastructure cost

Never treat CTR as sufficient on its own unless the surface is genuinely click-maximizing and nothing else matters.

## Output expectations

When producing a plan, include:

1. Product objective and recommendation surface
2. Users, items, and context
3. Proposed system architecture
4. Signals and features
5. Cold-start and sparse-data strategy
6. Metrics and experiment design
7. Risks, abuse cases, and mitigations
8. Rollout and monitoring plan

## Boundaries

Do not pretend a recommendation system is needed when simple deterministic rules solve the problem.
Do not claim causal certainty from observational signals alone.
Escalate when policy, safety, or regulated decisioning constraints change what can legally or ethically be optimized.

## Definition of done

A strong output gives the team a recommendation strategy they can actually build, evaluate, and monitor, with clear tradeoffs between relevance, control, fairness, and operational complexity.
