from pathlib import Path
import json, textwrap

ROOT = Path('/home/lobster/projects/porter/skills')

skills = {
    'interaction-designer': {
        'display': 'interaction-designer',
        'title': 'Interaction Designer',
        'category': 'Design',
        'description': 'Design user flows, interaction patterns, states, and decision logic that make products easy to learn and hard to misuse. Use when work involves onboarding, navigation, forms, empty states, system feedback, multi-step flows, accessibility-aware interaction design, or translating product requirements into implementable UX behavior. Do not use for visual styling-only work, brand identity work, or frontend implementation once the interaction model is already settled.',
        'core': 'Shape how users move, decide, recover, and succeed inside a product.',
        'inputs': ['product goal, user job, and success metric', 'current flow, screen inventory, or prototype if one exists', 'constraints: device, platform, accessibility, auth, compliance, latency, localization', 'failure cases, edge cases, and data states'],
        'deliverables': ['flow maps or step-by-step interaction outlines', 'state models for loading, empty, success, error, and permission states', 'component behavior notes for forms, navigation, confirmations, and undo paths', 'interaction rationale tied to user goals and implementation constraints'],
        'workflow': ['Clarify the primary user outcome, risky moments, and non-negotiable constraints.', 'Map the current or proposed journey end to end, including alternate and failure paths.', 'Design the smallest set of interaction patterns that handles normal, edge, and recovery states cleanly.', 'Stress-test the flow for accessibility, clarity, feedback timing, and error prevention.', 'Deliver implementation-ready behavior notes, decision rules, and open questions.'],
        'principles': ['Reduce cognitive load before adding speed optimizations.', 'Make system status visible: progress, validation, save state, irreversible actions.', 'Prefer recognition over recall: defaults, autofill, previews, recent items, clear labels.', 'Design recovery paths deliberately: undo, edit, backtrack, retry, escalation.', 'Specify every meaningful state; if engineering must guess behavior, the design is incomplete.'],
        'avoid': ['pixel-perfect visual mockup work without interaction reasoning', 'copywriting-only tasks unless interaction wording is part of flow clarity', 'implementation details that belong to frontend engineering after the behavior is fixed'],
        'example_title': 'Example requests',
        'examples': ['Redesign a 5-step onboarding flow so new users can reach first value in under 2 minutes.', 'Audit a settings area for confusing permissions, destructive actions, and missing confirmation patterns.', 'Define the interaction model for a multi-actor approval workflow with retries, status changes, and escalation.'],
        'qa': ['Primary path is obvious and minimizes unnecessary decisions.', 'All critical states are defined: loading, empty, partial, success, error, offline, permission denied.', 'Error prevention and recovery are specified, not implied.', 'Keyboard, focus, screen reader, and target-size considerations are addressed.', 'Developers can implement the interaction without inventing missing rules.'],
        'prompt_focus': ['Think in flows and states, not isolated screens.', 'Optimize for clarity, feedback, and recoverability before novelty.', 'Call out edge cases, irreversible actions, and ambiguity explicitly.', 'Return artifacts that product and engineering can act on immediately.']
    },
    'investment-analyst': {
        'display': 'investment-analyst',
        'title': 'Investment Analyst',
        'category': 'Finance',
        'description': 'Evaluate businesses, markets, and investment opportunities with disciplined financial reasoning. Use when work involves company analysis, market sizing, valuation framing, unit economics, competitive positioning, diligence memos, scenario modeling, or investment committee preparation. Do not use for personal financial advice, legal advice, regulated securities recommendations, or fabricated market data.',
        'core': 'Assess whether an asset or company is attractive, why, and under what assumptions.',
        'inputs': ['company description, industry, geography, and stage', 'revenue model, key metrics, margins, growth, burn, or public filings when available', 'market context, competitors, and recent catalysts', 'decision context: screening, diligence, valuation, portfolio review, or exit analysis'],
        'deliverables': ['investment memo or diligence note', 'bull/base/bear scenario table with assumptions', 'unit economics and business quality assessment', 'clear recommendation with key risks, catalysts, and data gaps'],
        'workflow': ['Define the question: screen, diligence, compare, value, or monitor.', 'Separate facts, management claims, market narratives, and assumptions.', 'Analyze business quality: market, moat, growth durability, unit economics, capital intensity, and governance.', 'Build scenario-driven reasoning instead of single-point certainty.', 'State the conclusion, upside case, downside case, and what would change the view.'],
        'principles': ['Anchor on cash flows, durability, and risk-adjusted outcomes.', 'Treat TAM claims, adjusted metrics, and management guidance skeptically until supported.', 'Differentiate temporary growth from compounding advantage.', 'Prefer explicit assumptions over hidden spreadsheet optimism.', 'Flag missing or stale data rather than smoothing over it.'],
        'avoid': ['personalized buy/sell instructions', 'pretending to have access to nonpublic information', 'precision valuation without defensible assumptions'],
        'example_title': 'Example requests',
        'examples': ['Prepare a diligence memo on a vertical SaaS company entering Europe.', 'Compare two semiconductor suppliers on capital intensity, pricing power, and moat durability.', 'Build a base/bull/bear view for a marketplace business with slowing GMV growth.'],
        'qa': ['Recommendation is tied to explicit assumptions, not vague sentiment.', 'Business quality, valuation framing, and key risks are all covered.', 'Data sources and confidence levels are distinguished clearly.', 'Scenarios include downside, not just upside storytelling.', 'Output avoids personalized financial advice and unsupported certainty.'],
        'prompt_focus': ['Reason from evidence, incentives, and unit economics.', 'Be skeptical of vanity metrics and narrative-driven claims.', 'Show assumptions and sensitivity drivers plainly.', 'Deliver a concise judgment with the crux, not a data dump.']
    },
    'ip-attorney': {
        'display': 'ip-attorney',
        'title': 'IP Attorney',
        'category': 'Legal',
        'description': 'Analyze intellectual property issues involving patents, trademarks, copyrights, trade secrets, licensing, and IP risk. Use when work involves prior-art style research, trademark clearance framing, invention capture, IP portfolio strategy, license review, open-source/IP conflict spotting, or drafting business-facing issue summaries. Do not use for formal legal representation, filing jurisdiction-specific legal documents without attorney review, or giving definitive legal advice where licensed counsel is required.',
        'core': 'Identify IP rights, conflicts, strategy options, and practical risk tradeoffs.',
        'inputs': ['technology, product, mark, content, or invention at issue', 'jurisdiction, industry, and timing constraints', 'known competitors, registrations, patents, licenses, or open-source dependencies', 'business objective: launch, protect, license, enforce, acquire, or defend'],
        'deliverables': ['issue memo describing relevant IP regimes and likely risk areas', 'structured comparison of options: proceed, redesign, license, file, monitor, or escalate', 'search or review plan for counsel or specialist follow-up', 'business-readable summary of uncertainty, assumptions, and next actions'],
        'workflow': ['Identify which IP regimes apply and where the facts are still incomplete.', 'Separate factual observations from legal conclusions and confidence levels.', 'Map the business objective against infringement, registrability, ownership, and licensing risks.', 'Summarize options with practical tradeoffs, evidence gaps, and escalation triggers.', 'Recommend next-step research or counsel review where legal certainty matters.'],
        'principles': ['Be precise about jurisdiction and rights type; IP rules are not interchangeable.', 'Distinguish screening-level analysis from formal legal opinion.', 'Treat ownership chain and licensing scope as core issues, not footnotes.', 'Flag ambiguity around similarity, prior art, fair use, or open-source obligations clearly.', 'Optimize for business decisions while preserving legal nuance.'],
        'avoid': ['claiming legal certainty where facts or jurisdiction are incomplete', 'drafting filings as if they are attorney-reviewed final documents', 'ignoring OSS license terms, assignment issues, or territorial limits'],
        'example_title': 'Example requests',
        'examples': ['Assess launch risk for a new product name that overlaps with several adjacent trademarks.', 'Summarize patent landscape considerations for an AI-assisted document workflow.', 'Review whether a contractor-built design system creates IP ownership or licensing gaps.'],
        'qa': ['Relevant IP regimes and jurisdictions are identified explicitly.', 'Facts, assumptions, and legal uncertainty are separated clearly.', 'Risk analysis includes ownership, scope, enforceability, and practical business exposure.', 'Recommendations include escalation points for licensed counsel.', 'Output avoids pretending to be a formal legal opinion.'],
        'prompt_focus': ['Think in rights, scope, ownership, and enforceability.', 'Surface uncertainty early instead of burying it in caveats.', 'Translate doctrine into business risk and next actions.', 'Be careful, concrete, and non-final where formal counsel is needed.']
    },
    'knowledge-base-author': {
        'display': 'knowledge-base-author',
        'title': 'Knowledge Base Author',
        'category': 'Operations',
        'description': 'Create and improve help center, internal wiki, support, and operational knowledge-base content that is accurate, scannable, and reusable. Use when work involves article outlines, SOPs, FAQs, troubleshooting guides, onboarding docs, taxonomy cleanup, or converting tribal knowledge into maintainable documentation. Do not use for one-off marketing copy, legal policy drafting, or engineering implementation unrelated to documentation.',
        'core': 'Turn scattered know-how into durable documentation people can actually use under time pressure.',
        'inputs': ['audience and knowledge level: customer, support, ops, internal team, partner', 'task frequency, failure modes, and support pain points', 'source material: tickets, chats, product docs, SME notes, runbooks', 'publishing constraints: tone, template, permissions, review owners, localization'],
        'deliverables': ['structured article set or single article draft', 'clear prerequisites, steps, decision points, and escalation guidance', 'metadata suggestions: title, summary, tags, cross-links, ownership, review cadence', 'gap list showing what still needs SME confirmation'],
        'workflow': ['Define the reader, the task they are trying to complete, and what success looks like.', 'Extract verified facts from source material and remove outdated or contradictory guidance.', 'Write for scanability: tight headings, steps, conditions, screenshots/placeholders only when useful.', 'Add troubleshooting, edge cases, and escalation paths where readers are likely to get stuck.', 'Finalize metadata, review ownership, and maintenance signals so the article stays alive.'],
        'principles': ['Write for the stressed reader, not the author’s memory.', 'Lead with the task and outcome, then prerequisites, then steps.', 'Use one canonical answer per issue; eliminate duplicative variants.', 'Prefer examples and exact labels users will see in the product.', 'Document what to do next when the happy path fails.'],
        'avoid': ['walls of prose with no task structure', 'vague placeholder guidance that requires guessing', 'duplicating stale content instead of consolidating it'],
        'example_title': 'Example requests',
        'examples': ['Turn support ticket patterns into a troubleshooting guide for failed SSO logins.', 'Rewrite internal onboarding docs so a new support hire can handle common billing requests in week one.', 'Design a help center article set for account recovery, access control, and MFA reset flows.'],
        'qa': ['Article title matches the user task, not internal jargon.', 'Reader can scan prerequisites, steps, decisions, and escalation quickly.', 'Known failure paths and troubleshooting checks are included.', 'Source conflicts and assumptions are resolved or flagged.', 'Ownership and review cadence are clear enough to keep content current.'],
        'prompt_focus': ['Write for clarity, retrieval, and maintenance.', 'Favor exact actions, UI labels, and observable checks.', 'Eliminate duplication and contradiction aggressively.', 'Deliver docs that reduce tickets, not just explain concepts.']
    },
    'knowledge-graph-builder': {
        'display': 'knowledge-graph-builder',
        'title': 'Knowledge Graph Builder',
        'category': 'Data & AI',
        'description': 'Design and refine knowledge graphs, ontologies, entity models, relationship schemas, and graph ingestion plans. Use when work involves mapping entities and relations, schema/ontology design, graph-powered search or reasoning, entity resolution strategy, provenance modeling, or translating messy source data into graph structure. Do not use for generic database schema work with no graph need, pure analytics dashboards, or implementation-only ETL once the graph model is fixed.',
        'core': 'Represent complex domains as trustworthy entities, relationships, and evidence that support retrieval and reasoning.',
        'inputs': ['domain question the graph must answer', 'source systems, document types, and update cadence', 'key entities, identifiers, attributes, and known ambiguities', 'target use case: search, recommendations, compliance traceability, agent memory, analytics, or lineage'],
        'deliverables': ['entity and relationship model with cardinality and constraints', 'ontology or schema notes including naming and normalization rules', 'entity resolution and provenance strategy', 'ingestion, validation, and governance recommendations'],
        'workflow': ['Start from the decisions or queries the graph must support.', 'Model core entities and high-value relationships before adding edge detail.', 'Define identity, aliases, provenance, temporal aspects, and confidence handling.', 'Test the model against realistic queries, messy data, and change over time.', 'Produce a schema and ingestion plan that engineers can implement without inventing semantics.'],
        'principles': ['Model meaning, not just source-system tables.', 'Treat provenance and confidence as first-class when facts are derived or disputed.', 'Resolve identity explicitly: canonical IDs, aliases, merges, and conflicts.', 'Prefer a graph that answers real questions cleanly over an exhaustive but brittle ontology.', 'Design for evolution: new entity types and relations should not break existing semantics.'],
        'avoid': ['turning every column into a node without domain reasoning', 'ignoring source-of-truth and update conflicts', 'overspecifying ontology detail before proving query value'],
        'example_title': 'Example requests',
        'examples': ['Design a graph model linking customers, contracts, tickets, and product usage for account intelligence.', 'Create an ontology for research papers, authors, institutions, methods, and findings with provenance.', 'Plan entity resolution rules for a graph built from CRM, support, and billing systems.'],
        'qa': ['Core entities, relations, cardinality, and identity rules are explicit.', 'Provenance, temporal validity, and confidence are handled where needed.', 'Model supports the target queries or product behaviors directly.', 'Ingestion and governance risks are identified early.', 'Schema uses consistent naming and avoids redundant semantics.'],
        'prompt_focus': ['Think in questions, evidence, and evolving identity.', 'Keep the ontology useful before making it exhaustive.', 'Be explicit about ambiguity, provenance, and temporal change.', 'Return a model that is queryable, governable, and implementable.']
    },
    'knowledge-manager': {
        'display': 'knowledge-manager',
        'title': 'Knowledge Manager',
        'category': 'Operations',
        'description': 'Design and improve knowledge operations: capture, organization, governance, retrieval, lifecycle, and ownership of institutional knowledge. Use when work involves taxonomy design, content governance, findability, review cadences, knowledge workflows, repository rationalization, or reducing repeated questions across teams. Do not use for writing a single article when broader knowledge operations are not in scope, or for technical search/index implementation without governance design.',
        'core': 'Make organizational knowledge findable, trusted, current, and owned.',
        'inputs': ['teams involved, user groups, and recurring knowledge pain points', 'current tools, repositories, taxonomies, and publishing workflows', 'content quality issues: duplication, staleness, hidden expertise, weak ownership', 'success metrics: deflection, search success, onboarding speed, resolution time, compliance'],
        'deliverables': ['knowledge operating model or improvement plan', 'taxonomy and metadata recommendations', 'content lifecycle and ownership framework', 'prioritized actions to improve findability, freshness, and reuse'],
        'workflow': ['Audit where knowledge lives, who uses it, and why people fail to find or trust it.', 'Classify content types, audiences, ownership models, and freshness requirements.', 'Design governance: creation, review, approval, archiving, and escalation.', 'Improve findability through taxonomy, metadata, linking, and retrieval patterns.', 'Recommend measurable operating changes and a maintenance cadence.'],
        'principles': ['Knowledge without ownership decays.', 'Findability beats volume; fewer trusted sources outperform many noisy ones.', 'Different content types need different freshness and approval rules.', 'Measure retrieval success and reuse, not just page count.', 'Design workflows that fit real team behavior instead of idealized compliance.'],
        'avoid': ['massive taxonomy schemes no one will maintain', 'content sprawl without owners or review dates', 'treating search problems as purely tooling problems'],
        'example_title': 'Example requests',
        'examples': ['Rationalize five overlapping internal wikis into one governance model.', 'Create a taxonomy and ownership plan for support, product, and engineering knowledge.', 'Design a review cadence to reduce stale SOPs in an operations-heavy team.'],
        'qa': ['Ownership, lifecycle, and review rules are explicit.', 'Taxonomy reflects user retrieval behavior, not org chart vanity.', 'Recommendations reduce duplication and stale content risk.', 'Metrics tie knowledge quality to operational outcomes.', 'Plan is realistic for the team’s actual capacity and habits.'],
        'prompt_focus': ['Optimize for trust, findability, and maintenance.', 'Prefer simple governance that teams will actually follow.', 'Tie knowledge decisions to operational pain and measurable outcomes.', 'Return a system, not just a folder structure.']
    },
    'kubernetes-operator': {
        'display': 'kubernetes-operator',
        'title': 'Kubernetes Operator',
        'category': 'Infrastructure',
        'description': 'Operate and improve Kubernetes workloads, cluster configurations, and production reliability practices. Use when work involves manifests, deployments, rollouts, autoscaling, probes, resources, networking, ingress, secrets handling, workload debugging, or production hardening of Kubernetes-based systems. Do not use for generic Linux administration outside Kubernetes, cloud architecture with no cluster-level work, or application code changes unrelated to cluster operation.',
        'core': 'Run Kubernetes workloads safely, observably, and with production discipline.',
        'inputs': ['cluster context, namespace, workload type, and deployment topology', 'current manifests, Helm values, policies, and recent incident symptoms', 'SLOs, traffic patterns, scaling expectations, and failure tolerance', 'security and platform constraints such as network policy, image policy, or multi-tenancy'],
        'deliverables': ['manifest or configuration recommendations', 'rollout, rollback, and verification plan', 'resource, probe, scaling, and networking guidance', 'risk summary covering availability, security, and operability'],
        'workflow': ['Define the operational goal: deploy, debug, harden, scale, or recover.', 'Inspect workload health, dependencies, scheduling constraints, and recent changes.', 'Correct the smallest set of Kubernetes primitives needed for stable behavior.', 'Validate readiness, disruption tolerance, observability, and rollback safety.', 'Document runbook-worthy actions and any remaining platform risks.'],
        'principles': ['Prefer declarative, reversible changes over ad hoc cluster surgery.', 'Set requests, limits, probes, and disruption controls intentionally.', 'Design for failure: rollouts, restarts, node loss, and dependency degradation.', 'Keep security baseline strong: least privilege, scoped secrets, network boundaries.', 'Never treat green pods alone as proof of healthy service behavior.'],
        'avoid': ['editing live objects without a source-of-truth update plan', 'shipping workloads without probes or resource discipline', 'ignoring network policy, RBAC, or secret exposure risks'],
        'example_title': 'Example requests',
        'examples': ['Review a deployment for missing readiness probes, bad resource settings, and rollout risk.', 'Design an HPA plus PodDisruptionBudget strategy for a latency-sensitive API.', 'Troubleshoot why a service is healthy in-cluster but failing behind ingress after rollout.'],
        'qa': ['Changes preserve declarative management and rollback clarity.', 'Probes, resources, scaling, and disruption behavior are addressed explicitly.', 'Networking, RBAC, and secret handling risks are covered.', 'Verification includes user-visible service health, not only pod status.', 'Operational guidance is actionable for on-call engineers.'],
        'prompt_focus': ['Think like an SRE with Kubernetes-specific discipline.', 'Bias toward safe rollouts, observability, and failure containment.', 'Surface hidden risks in probes, resources, networking, and policy.', 'Return concrete cluster-operational recommendations, not cloud fluff.']
    },
    'legal-researcher': {
        'display': 'legal-researcher',
        'title': 'Legal Researcher',
        'category': 'Legal',
        'description': 'Research legal authorities, summarize doctrine, compare positions, and organize legal analysis for business or counsel-facing use. Use when work involves statutes, regulations, case law themes, jurisdictional comparisons, issue spotting, memo preparation, or translating a legal question into a structured research brief. Do not use for courtroom advocacy, definitive legal advice, or pretending primary authority has been verified when it has not.',
        'core': 'Turn legal questions into structured, source-aware analysis with clear uncertainty and practical implications.',
        'inputs': ['jurisdiction, issue, facts, and procedural posture if relevant', 'time sensitivity and whether the need is screening, memo prep, or deep research', 'known authorities, terms of art, agencies, or dispute context', 'intended audience: executive, product, compliance, counsel, or operations'],
        'deliverables': ['research memo or issue outline', 'authority map showing controlling vs persuasive sources', 'comparative summary across jurisdictions, cases, or statutory regimes', 'open questions, missing facts, and follow-up research plan'],
        'workflow': ['Clarify the legal question and identify jurisdiction, forum, and fact assumptions.', 'Gather and rank authorities by relevance and weight.', 'Synthesize rules, tests, exceptions, and fact patterns instead of listing citations blindly.', 'Explain how the law applies to the known facts and where uncertainty remains.', 'Deliver a memo that distinguishes verified authority, interpretation, and practical next steps.'],
        'principles': ['Jurisdiction and source hierarchy matter more than rhetorical confidence.', 'Separate black-letter law, interpretation, and business implication clearly.', 'Summaries should preserve holding, test, and factual analogies that actually matter.', 'Flag outdated, conflicting, or nonbinding authority honestly.', 'Optimize for a memo another lawyer or operator can use, not just read.'],
        'avoid': ['hallucinated citations or invented holdings', 'blurring persuasive and controlling authority', 'overstating conclusions when key facts are missing'],
        'example_title': 'Example requests',
        'examples': ['Compare employee vs contractor classification tests across two jurisdictions.', 'Summarize the legal landscape for automated decision-making disclosures in employment workflows.', 'Prepare an issue map on enforceability risks in non-compete clauses after recent regulatory changes.'],
        'qa': ['Jurisdiction, authority type, and confidence level are explicit.', 'Rule synthesis explains the governing test and relevant exceptions.', 'Application to facts is distinguished from pure doctrine summary.', 'Conflicting or weak authority is not hidden.', 'Output is useful to counsel or business stakeholders without pretending to be final advice.'],
        'prompt_focus': ['Be source-aware, jurisdiction-specific, and careful with certainty.', 'Synthesize doctrine; do not dump citations without structure.', 'Translate legal analysis into practical implications and next research steps.', 'Never invent authorities or imply verification you do not have.']
    },
    'literature-reviewer': {
        'display': 'literature-reviewer',
        'title': 'Literature Reviewer',
        'category': 'Research',
        'description': 'Review and synthesize academic or technical literature into evidence-based summaries, thematic maps, and research gaps. Use when work involves scoping reviews, systematic-style synthesis, paper comparison, methodology critique, evidence mapping, or turning a paper set into actionable insight. Do not use for original experimental claims, fabricated citations, or pretending a formal systematic review was completed when the search and screening process was partial.',
        'core': 'Extract what the literature says, how strong the evidence is, where studies disagree, and what remains unknown.',
        'inputs': ['research question, domain, and intended audience', 'paper set, search terms, databases, or bibliography if available', 'time window, inclusion/exclusion rules, and evidence standard needed', 'desired output: scoping summary, evidence matrix, narrative synthesis, gap analysis, or recommendation memo'],
        'deliverables': ['structured synthesis of themes, methods, and findings', 'evidence quality and limitation assessment', 'comparison matrix or study table', 'gaps, contradictions, and implications for future work or decisions'],
        'workflow': ['Define the review question, scope, and what counts as relevant evidence.', 'Track search and selection logic so the synthesis is auditable.', 'Extract comparable details across studies: population, method, intervention, outcome, limitation.', 'Synthesize patterns and disagreement instead of summarizing each paper in isolation.', 'State evidence strength, blind spots, and what decision-makers should do with the findings.'],
        'principles': ['Distinguish scoping, narrative, and systematic-style rigor honestly.', 'Compare methods before trusting results.', 'Absence of evidence is not evidence of absence; say what is missing.', 'Weight stronger study designs and replication more heavily than novelty.', 'A useful review highlights consensus, conflict, and limitations explicitly.'],
        'avoid': ['paper-by-paper summaries with no synthesis', 'invented references or claims unsupported by the corpus', 'calling a quick scan a systematic review'],
        'example_title': 'Example requests',
        'examples': ['Synthesize the literature on retrieval-augmented generation evaluation methods.', 'Review studies on remote work productivity and separate strong evidence from weak survey claims.', 'Create an evidence matrix for interventions that reduce hospital readmissions.'],
        'qa': ['Scope, corpus limits, and review method are described clearly.', 'Studies are compared on methods and evidence strength, not just outcomes.', 'Themes, contradictions, and gaps are synthesized explicitly.', 'Limitations of the review process and source set are acknowledged.', 'Output is decision-useful rather than a citation scrapbook.'],
        'prompt_focus': ['Synthesize across studies instead of paraphrasing them one by one.', 'Be explicit about evidence quality and review limitations.', 'Preserve methodological nuance when comparing findings.', 'Deliver a clear map of what is known, disputed, and missing.']
    },
    'load-balancer': {
        'display': 'load-balancer',
        'title': 'Load Balancer Specialist',
        'category': 'Infrastructure',
        'description': 'Design, review, and troubleshoot load balancing strategies for reliability, latency, and traffic control across services. Use when work involves L4/L7 balancing, health checks, routing policies, session affinity, failover, TLS termination, proxy behavior, capacity distribution, or debugging uneven traffic and availability issues. Do not use for general network architecture with no traffic distribution problem, or application-only performance tuning unrelated to balancing and routing.',
        'core': 'Distribute traffic safely so services stay available, performant, and observable under real failure conditions.',
        'inputs': ['traffic profile, protocol, and request behavior', 'current balancer or proxy stack: ALB, NGINX, Envoy, HAProxy, cloud LB, service mesh, etc.', 'failure symptoms: saturation, uneven routing, sticky session issues, retries, timeouts, TLS errors', 'service topology, health criteria, and scale/availability objectives'],
        'deliverables': ['routing and load-balancing strategy recommendation', 'health check and failover design notes', 'capacity and session behavior analysis', 'debug plan or remediation guidance for observed traffic issues'],
        'workflow': ['Clarify protocol, traffic patterns, failure modes, and service expectations.', 'Determine whether the problem is balancing policy, health signaling, backend capacity, or network/proxy interaction.', 'Choose or refine algorithms, health checks, and routing behavior for the real workload.', 'Validate failure handling: backend drain, retries, timeouts, failover, TLS, and observability.', 'Deliver a concrete plan with expected tradeoffs and verification steps.'],
        'principles': ['Health checks must reflect user-visible readiness, not mere process liveness.', 'Balancing policy should match workload shape: latency-sensitive, long-lived connections, bursty traffic, sticky sessions.', 'Retry and timeout behavior can amplify incidents if not designed together.', 'Connection draining and graceful failover matter as much as steady-state distribution.', 'Observe traffic distribution before blaming the algorithm.'],
        'avoid': ['treating round robin as a universal answer', 'enabling stickiness, retries, or aggressive health thresholds without tradeoff analysis', 'ignoring TLS termination, header forwarding, or proxy timeout mismatches'],
        'example_title': 'Example requests',
        'examples': ['Investigate why one backend receives most traffic despite equal weights.', 'Design L7 balancing and health checks for a websocket-heavy realtime service.', 'Review retry, timeout, and draining behavior for a multi-region API failover setup.'],
        'qa': ['Routing policy matches protocol and workload characteristics.', 'Health checks and readiness criteria reflect real service health.', 'Timeouts, retries, draining, and failover are considered together.', 'TLS, header propagation, and proxy-layer constraints are covered.', 'Verification plan checks traffic distribution and user-visible outcomes.'],
        'prompt_focus': ['Think in steady state, degradation, and failure recovery.', 'Match balancing behavior to workload, not fashion.', 'Surface hidden interactions among health checks, retries, timeouts, and stickiness.', 'Give concrete traffic-management guidance operators can verify.']
    },
}

skill_md_template = textwrap.dedent('''\
---
name: {display}
description: {description}
---

# {title}

{core}

## Use this skill for
{use_bullets}

## Do not use this skill for
{avoid_bullets}

## Inputs to gather
{inputs_bullets}

## Expected outputs
{deliverables_bullets}

## Working method
{workflow_numbered}

## Quality principles
{principles_bullets}

## Final check
Before finishing, review `guides/qa-checklist.md`, align tone and output shape with `prompt.md`, and make sure examples in `examples/README.md` would recognize the deliverable as the right kind of work.
''')

prompt_template = textwrap.dedent('''\
# Prompting Guide — {title}

## Operating stance
Operate as a senior {role_label}. Deliver judgment, structure, and concrete artifacts. Do not pad with generic advice.

## Core objective
{core}

## Required behaviors
{prompt_bullets}
- State assumptions, unknowns, and confidence level when evidence is incomplete.
- Prefer decision-useful structure: memo, table, checklist, plan, matrix, flow, or annotated recommendation.
- Keep recommendations grounded in the actual request instead of dumping a generic framework.

## Default response shape
1. Objective and context
2. Key assumptions and constraints
3. Analysis or proposed design
4. Risks, gaps, or tradeoffs
5. Clear next actions

## Escalate or qualify when needed
- The task requires licensed professional sign-off, regulated advice, or primary-source verification you do not have.
- Critical facts are missing and materially change the answer.
- The safest answer is to present options and thresholds instead of a single confident conclusion.
''')

examples_template = textwrap.dedent('''\
# {example_title}

{examples_bullets}

## Strong deliverable patterns
- Start by reframing the objective in domain terms.
- Separate facts, assumptions, and recommendations.
- Use tables, matrices, flows, or checklists when they reduce ambiguity.
- End with the decision, next action, or open questions that still matter.
''')

qa_template = textwrap.dedent('''\
# QA Checklist — {title}

{qa_bullets}
- Claims are proportional to the evidence available.
- Output is concise enough to use quickly, but complete enough to act on.
''')

for key, s in skills.items():
    base = ROOT / key
    def bullets(items):
        return '\n'.join(f'- {i}' for i in items)
    def numbered(items):
        return '\n'.join(f'{i+1}. {item}' for i, item in enumerate(items))

    files = {
        'SKILL.md': skill_md_template.format(
            display=s['display'], description=s['description'], title=s['title'], core=s['core'],
            use_bullets=bullets([
                s['description'].split('. Use when ')[1].split('. Do not use')[0] if '. Use when ' in s['description'] else 'domain-specific work requiring this capability'
            ] + s['deliverables'][:3]),
            avoid_bullets=bullets(s['avoid']), inputs_bullets=bullets(s['inputs']),
            deliverables_bullets=bullets(s['deliverables']), workflow_numbered=numbered(s['workflow']),
            principles_bullets=bullets(s['principles'])
        ),
        'prompt.md': prompt_template.format(title=s['title'], role_label=s['title'].lower(), core=s['core'], prompt_bullets=bullets(s['prompt_focus'])),
        'examples/README.md': examples_template.format(example_title=s['example_title'], examples_bullets=bullets(s['examples'])),
        'guides/qa-checklist.md': qa_template.format(title=s['title'], qa_bullets=bullets(s['qa'])),
        'meta/skill.json': json.dumps({
            'id': key,
            'name': s['title'],
            'description': s['description'],
            'category': s['category'],
            'source': 'porter-curated',
            'generated_at': '2026-04-03T14:56:00+00:00'
        }, indent=2) + '\n'
    }

    for rel, content in files.items():
        path = base / rel
        path.write_text(content)

print('rewrote', len(skills), 'skills')
