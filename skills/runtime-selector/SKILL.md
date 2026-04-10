---
name: runtime-selector
description: Select the best runtime or model path for a task by balancing capability, latency, cost, reliability, context fit, policy constraints, and fallback behavior. Use when defining routing choices, workload policies, escalation paths, or explainable tradeoffs between speed, quality, and spend.
---

# Runtime Selector

Pick the runtime that fits the work and the operating conditions, not the one with the loudest benchmark story.

## Mission

Match workload demands to the right execution path so Porter gets adequate quality at the lowest acceptable cost and risk. Good routing is constraint-aware, health-aware, and explicit about fallback behavior.

## Use this skill when

- choosing a runtime for a specific task, request class, or workflow stage
- defining routing policy across multiple available runtimes
- balancing quality, speed, cost, and reliability under real constraints
- deciding when premium reasoning or long-context paths are actually justified
- designing fallback order and reroute triggers for degraded conditions
- explaining why one model path is better than another for a given workload

## Do not use this skill for

- choosing by benchmark prestige or personal preference alone
- ignoring runtime health, quotas, or rate limits
- routing sensitive work onto paths that violate policy or data constraints
- assuming one default runtime should handle everything forever
- auditing a live incident after the fact; use `runtime-auditor` for that

## Core principles

1. **Classify the workload first.** Routing quality depends more on understanding the task than on ranking models in the abstract.
2. **Enforce hard constraints before optimization.** Security, policy, tool support, context-window limits, and runtime availability narrow the feasible set.
3. **Optimize for required value, not theoretical maximum quality.** Many tasks need good-enough output delivered cheaply and quickly.
4. **Design routing for degradation.** A primary choice without fallback logic is incomplete.
5. **Stay health-aware.** A runtime that was optimal yesterday may be slow, expensive, unstable, or quota-constrained today.
6. **Make tradeoffs reviewable.** Operators should be able to see why the winner wins.

## Inputs to gather

Before recommending a path, gather:
- task type, ambiguity, and expected output quality
- latency sensitivity and throughput needs
- budget or cost ceiling
- context length, tool use, multimodal, or interactive requirements
- privacy, security, and compliance limits
- current runtime health, quota state, and fallback availability
- whether the work is one-shot, iterative, batch, or human-in-the-loop

If success criteria are vague, state that clearly. Runtime selection only makes sense relative to what "good" looks like.

## Working method

### 1. Classify the workload

Useful buckets include:
- bounded extraction or transformation
- routine drafting
- tool-heavy execution
- multi-step coding
- long-context synthesis
- high-stakes strategic reasoning
- interactive conversational support
- sensitive / policy-constrained handling

### 2. Eliminate invalid options

Remove runtimes that fail hard constraints: policy, security, data locality, tool support, context limits, or live health status.

### 3. Compare the feasible set

For each candidate, compare:
- capability fit
- latency profile
- cost profile
- reliability / quota risk
- context and tool support
- operator simplicity

### 4. Choose the primary path

Pick the lowest-cost path that still reliably meets the task's quality bar under current conditions.

### 5. Define fallback behavior

Specify:
- next runtime in order
- what triggers reroute or escalation
- whether fallback is automatic, temporary, or operator-approved
- when to restore the default path

### 6. State monitoring signals

Name what to watch after rollout: latency percentiles, error rate, fallback rate, quality complaints, unit cost, or queue pressure.

## Output expectations

A strong routing recommendation usually includes:
- workload summary and success criteria
- hard constraints that eliminate options
- candidate runtimes and visible tradeoffs
- primary recommendation
- fallback chain with trigger conditions
- monitoring or reevaluation signals
- exceptions for sensitive, high-stakes, or degraded-mode traffic

## Decision heuristics

Prefer:
- smaller / cheaper runtimes for routine bounded tasks
- stronger runtimes for ambiguous, high-stakes, or long-horizon reasoning
- workload segmentation instead of one-size-fits-all defaults
- fallback trees that operators can actually run
- policies that remain understandable six months later

Avoid:
- overprovisioning expensive runtimes for low-value tasks
- ignoring rate-limit and health reality in favor of benchmark rankings
- routing private or regulated work to non-compliant paths
- fallback chains with no trigger logic
- static routing that survives long after operating conditions changed

## Adjacent boundaries

- **runtime-auditor** — explain what is happening in live runtime behavior and incidents
- **site-reliability** — design reliability systems and operational practice at a broader level
- **security-auditor** — validate policy, privacy, and security implications of candidate paths
- **roster-curator** — manage skill taxonomy, not execution-path choice

## Quality bar

A strong result:
- chooses the runtime for the right workload reasons
- makes tradeoffs across quality, speed, cost, and reliability obvious
- avoids unnecessary spend without underpowering important tasks
- includes a realistic fallback path
- remains defensible when runtime health changes tomorrow

## Use the supporting files

- Read `prompt.md` for routing posture and tradeoff language.
- Read `examples/README.md` for output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for metadata and adjacent boundaries.