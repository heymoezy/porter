#!/usr/bin/env bash
# seed-skills-expansion.sh — Generate 170+ new skills for Porter
# Idempotent: skips skills that already exist in DB. Safe to re-run.
set -euo pipefail

DB="porter"
SKILLS_DIR="/home/lobster/documents/porter/skills"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
CREATED=0
SKIPPED=0

mkdir -p "$SKILLS_DIR"

# Fetch existing skill IDs from DB
EXISTING=$(psql -d "$DB" -t -A -c "SELECT id FROM skills;" 2>/dev/null || echo "")

skill_exists() {
  echo "$EXISTING" | grep -qx "$1"
}

# ─── Skill definition format: id|name|category|description ───
# Each line is one skill. We use | as delimiter.

read -r -d '' SKILLS_DATA << 'SKILLS_EOF' || true
frontend-dev|Frontend Developer|Engineering|Builds responsive, accessible web interfaces with modern frameworks
backend-dev|Backend Developer|Engineering|Designs and implements server-side logic, APIs, and data layers
fullstack-dev|Fullstack Developer|Engineering|Delivers end-to-end features spanning UI through database
mobile-dev|Mobile Developer|Engineering|Creates native and cross-platform mobile applications
devops-engineer|DevOps Engineer|Engineering|Automates build, test, and deployment pipelines
cloud-architect|Cloud Architect|Engineering|Designs scalable, cost-effective cloud infrastructure
security-auditor|Security Auditor|Engineering|Identifies vulnerabilities and enforces security best practices
performance-optimizer|Performance Optimizer|Engineering|Profiles and eliminates bottlenecks across the stack
database-admin|Database Administrator|Engineering|Manages schema design, query optimization, and data integrity
api-designer|API Designer|Engineering|Crafts clean, versioned, well-documented API contracts
test-engineer|Test Engineer|Engineering|Builds comprehensive test suites and quality automation
ci-cd-specialist|CI/CD Specialist|Engineering|Configures and maintains continuous integration and delivery pipelines
infrastructure-engineer|Infrastructure Engineer|Engineering|Provisions and manages servers, networks, and platform services
site-reliability|Site Reliability Engineer|Engineering|Ensures uptime, observability, and incident response readiness
system-architect|System Architect|Engineering|Defines high-level system design and technology selection
microservices-designer|Microservices Designer|Engineering|Decomposes monoliths into well-bounded, communicating services
code-reviewer|Code Reviewer|Engineering|Provides thorough, constructive code review feedback
tech-debt-manager|Tech Debt Manager|Engineering|Identifies, prioritizes, and systematically reduces technical debt
release-manager|Release Manager|Engineering|Coordinates release trains, changelogs, and deployment schedules
documentation-writer|Documentation Writer|Engineering|Produces clear technical documentation, READMEs, and API docs
ml-engineer|ML Engineer|Data & AI|Builds and deploys production machine learning systems
data-scientist|Data Scientist|Data & AI|Extracts insights from data using statistical and ML methods
data-engineer|Data Engineer|Data & AI|Builds reliable data pipelines and warehousing infrastructure
etl-developer|ETL Developer|Data & AI|Designs extract-transform-load workflows for data integration
bi-analyst|BI Analyst|Data & AI|Creates dashboards and reports that drive business decisions
ml-ops|MLOps Engineer|Data & AI|Manages ML model lifecycle from training to production monitoring
model-trainer|Model Trainer|Data & AI|Fine-tunes and trains ML models on domain-specific data
prompt-engineer|Prompt Engineer|Data & AI|Crafts effective prompts and prompt chains for LLM applications
ai-safety-reviewer|AI Safety Reviewer|Data & AI|Evaluates AI outputs for bias, toxicity, and alignment risks
data-pipeline-architect|Data Pipeline Architect|Data & AI|Designs scalable, fault-tolerant data processing architectures
feature-engineer|Feature Engineer|Data & AI|Creates and selects features that maximize model performance
nlp-specialist|NLP Specialist|Data & AI|Builds text processing, classification, and generation systems
computer-vision-engineer|Computer Vision Engineer|Data & AI|Develops image and video analysis solutions
recommendation-engineer|Recommendation Engineer|Data & AI|Builds personalized recommendation and ranking systems
data-governance|Data Governance Specialist|Data & AI|Enforces data quality, lineage, and compliance standards
analytics-engineer|Analytics Engineer|Data & AI|Transforms raw data into clean, modeled analytics datasets
experiment-designer|Experiment Designer|Data & AI|Designs A/B tests and experiments with statistical rigor
model-evaluator|Model Evaluator|Data & AI|Benchmarks and validates ML model performance and fairness
synthetic-data-generator|Synthetic Data Generator|Data & AI|Creates realistic synthetic datasets for training and testing
knowledge-graph-builder|Knowledge Graph Builder|Data & AI|Constructs and queries knowledge graphs from structured and unstructured data
brand-designer|Brand Designer|Creative|Develops cohesive visual identities and brand guidelines
motion-designer|Motion Designer|Creative|Creates animations, transitions, and motion graphics
ux-writer|UX Writer|Creative|Crafts microcopy, tooltips, and interface text that guides users
video-producer|Video Producer|Creative|Plans, scripts, and produces video content
podcast-producer|Podcast Producer|Creative|Plans, records, edits, and distributes podcast episodes
illustration-artist|Illustration Artist|Creative|Creates original illustrations and visual narratives
game-designer|Game Designer|Creative|Designs game mechanics, levels, and player experiences
3d-artist|3D Artist|Creative|Models, textures, and renders 3D assets and environments
sound-designer|Sound Designer|Creative|Creates audio effects, soundscapes, and audio branding
photography-director|Photography Director|Creative|Plans and directs photo shoots and image curation
animation-lead|Animation Lead|Creative|Directs animation projects from storyboard to final render
storyboard-artist|Storyboard Artist|Creative|Visualizes narrative sequences through sequential illustrations
creative-strategist|Creative Strategist|Creative|Develops creative briefs and campaign concepts
art-director|Art Director|Creative|Sets visual direction and maintains creative standards
typography-specialist|Typography Specialist|Creative|Selects and pairs typefaces for optimal readability and brand fit
product-manager|Product Manager|Business|Prioritizes features, defines roadmaps, and ships products
growth-hacker|Growth Hacker|Business|Designs and executes rapid growth experiments
pricing-strategist|Pricing Strategist|Business|Develops pricing models that maximize revenue and retention
market-analyst|Market Analyst|Business|Analyzes market trends, sizing, and competitive landscape
business-analyst|Business Analyst|Business|Translates business needs into actionable requirements
operations-manager|Operations Manager|Business|Streamlines processes and optimizes operational efficiency
vendor-manager|Vendor Manager|Business|Evaluates, selects, and manages third-party vendors
financial-analyst|Financial Analyst|Business|Builds financial models, forecasts, and investment analyses
risk-assessor|Risk Assessor|Business|Identifies, quantifies, and mitigates business risks
strategic-planner|Strategic Planner|Business|Develops long-term strategies and competitive positioning
competitive-analyst|Competitive Analyst|Business|Monitors competitors and identifies strategic opportunities
investment-analyst|Investment Analyst|Business|Evaluates investment opportunities and portfolio allocation
supply-chain-optimizer|Supply Chain Optimizer|Business|Optimizes logistics, inventory, and supplier networks
procurement-specialist|Procurement Specialist|Business|Manages purchasing, contracts, and cost negotiations
revenue-optimizer|Revenue Optimizer|Business|Identifies and implements revenue growth levers
unit-economics-analyst|Unit Economics Analyst|Business|Analyzes per-unit costs, margins, and profitability drivers
go-to-market-planner|Go-to-Market Planner|Business|Designs launch strategies and market entry plans
partnership-developer|Partnership Developer|Business|Identifies and structures strategic partnerships
franchise-analyst|Franchise Analyst|Business|Evaluates franchise models and expansion opportunities
mergers-analyst|Mergers & Acquisitions Analyst|Business|Conducts due diligence and deal structuring analysis
blog-writer|Blog Writer|Content|Writes engaging, SEO-friendly blog posts and articles
technical-writer|Technical Writer|Content|Produces clear, accurate technical documentation
newsletter-curator|Newsletter Curator|Content|Curates and writes compelling newsletter editions
podcast-scriptwriter|Podcast Scriptwriter|Content|Writes structured, engaging podcast scripts
course-creator|Course Creator|Content|Designs and builds educational courses and curricula
whitepaper-author|Whitepaper Author|Content|Writes authoritative whitepapers and research reports
case-study-writer|Case Study Writer|Content|Crafts compelling customer success stories
press-release-writer|Press Release Writer|Content|Writes newsworthy press releases and media statements
speech-writer|Speech Writer|Content|Crafts persuasive speeches and presentation scripts
grant-writer|Grant Writer|Content|Writes compelling grant proposals and funding applications
proposal-writer|Proposal Writer|Content|Creates persuasive business and project proposals
annual-report-writer|Annual Report Writer|Content|Produces comprehensive organizational annual reports
knowledge-base-author|Knowledge Base Author|Content|Builds searchable help centers and knowledge bases
faq-builder|FAQ Builder|Content|Creates comprehensive, well-organized FAQ sections
tutorial-creator|Tutorial Creator|Content|Writes step-by-step tutorials with examples and exercises
style-guide-writer|Style Guide Writer|Content|Defines editorial standards and writing conventions
localization-specialist|Localization Specialist|Content|Adapts content for international markets and cultures
content-auditor|Content Auditor|Content|Reviews existing content for accuracy, gaps, and quality
editorial-planner|Editorial Planner|Content|Plans content calendars and editorial workflows
ghostwriter|Ghostwriter|Content|Writes content in another person's voice and style
ui-designer|UI Designer|Design|Creates pixel-perfect user interface designs
ux-researcher|UX Researcher|Design|Conducts user research to inform design decisions
interaction-designer|Interaction Designer|Design|Designs intuitive interaction patterns and user flows
design-system-architect|Design System Architect|Design|Builds and maintains scalable design systems
accessibility-specialist|Accessibility Specialist|Design|Ensures products meet WCAG and inclusive design standards
icon-designer|Icon Designer|Design|Creates consistent, recognizable icon sets
dashboard-designer|Dashboard Designer|Design|Designs data-rich dashboards that communicate clearly
mobile-designer|Mobile Designer|Design|Designs native mobile interfaces for iOS and Android
web-designer|Web Designer|Design|Creates visually compelling, responsive web layouts
print-designer|Print Designer|Design|Designs print materials, layouts, and publication assets
packaging-designer|Packaging Designer|Design|Designs product packaging and unboxing experiences
infographic-designer|Infographic Designer|Design|Transforms data into visual, shareable infographics
wireframe-specialist|Wireframe Specialist|Design|Creates low and high fidelity wireframes and page flows
prototype-builder|Prototype Builder|Design|Builds interactive prototypes for user testing
design-qa|Design QA|Design|Verifies implementation matches design specs pixel-for-pixel
academic-researcher|Academic Researcher|Research|Conducts rigorous literature reviews and academic analysis
patent-researcher|Patent Researcher|Research|Searches and analyzes patent databases and prior art
competitive-intelligence|Competitive Intelligence|Research|Gathers and synthesizes competitive market intelligence
market-researcher|Market Researcher|Research|Designs and executes market research studies
user-researcher|User Researcher|Research|Conducts interviews, surveys, and usability studies
survey-designer|Survey Designer|Research|Designs effective surveys with unbiased methodology
ethnographer|Ethnographer|Research|Studies user behavior in natural contexts
bibliographic-researcher|Bibliographic Researcher|Research|Compiles and annotates comprehensive bibliographies
trend-forecaster|Trend Forecaster|Research|Identifies emerging trends and future scenarios
policy-researcher|Policy Researcher|Research|Analyzes public policy impacts and regulatory landscapes
clinical-researcher|Clinical Researcher|Research|Designs and analyzes clinical studies and health data
technology-scout|Technology Scout|Research|Evaluates emerging technologies for strategic adoption
benchmarking-analyst|Benchmarking Analyst|Research|Compares performance metrics against industry standards
literature-reviewer|Literature Reviewer|Research|Synthesizes academic and professional literature
data-journalist|Data Journalist|Research|Investigates and reports stories driven by data analysis
helpdesk-agent|Helpdesk Agent|Support|Resolves user issues with empathy and technical accuracy
onboarding-specialist|Onboarding Specialist|Support|Designs and delivers smooth user onboarding experiences
training-developer|Training Developer|Support|Creates training materials, workshops, and learning paths
community-manager|Community Manager|Support|Grows and moderates engaged user communities
escalation-handler|Escalation Handler|Support|Manages critical escalations with urgency and care
feedback-analyst|Feedback Analyst|Support|Analyzes user feedback to surface actionable insights
knowledge-manager|Knowledge Manager|Support|Organizes and maintains institutional knowledge systems
service-level-monitor|Service Level Monitor|Support|Tracks SLA compliance and service quality metrics
chatbot-trainer|Chatbot Trainer|Support|Trains and refines conversational AI systems
customer-success-manager|Customer Success Manager|Support|Drives adoption, retention, and customer satisfaction
contract-reviewer|Contract Reviewer|Legal|Reviews contracts for risks, obligations, and compliance
compliance-officer|Compliance Officer|Legal|Ensures regulatory compliance across operations
privacy-specialist|Privacy Specialist|Legal|Manages data privacy, GDPR, and consent frameworks
ip-attorney|IP Attorney|Legal|Advises on intellectual property protection and strategy
regulatory-analyst|Regulatory Analyst|Legal|Analyzes regulatory requirements and impact assessments
policy-drafter|Policy Drafter|Legal|Writes clear organizational policies and procedures
legal-researcher|Legal Researcher|Legal|Researches case law, statutes, and legal precedents
dispute-resolver|Dispute Resolver|Legal|Mediates conflicts and structures resolution agreements
due-diligence-analyst|Due Diligence Analyst|Legal|Conducts comprehensive due diligence investigations
employment-law-specialist|Employment Law Specialist|Legal|Advises on employment law, contracts, and HR compliance
fintech-specialist|Fintech Specialist|Domain|Designs and evaluates financial technology solutions
healthcare-analyst|Healthcare Analyst|Domain|Analyzes healthcare data, workflows, and compliance
edtech-designer|EdTech Designer|Domain|Designs educational technology products and learning experiences
real-estate-analyst|Real Estate Analyst|Domain|Analyzes property markets, valuations, and investment returns
crypto-analyst|Crypto Analyst|Domain|Evaluates blockchain projects, tokenomics, and DeFi protocols
sustainability-advisor|Sustainability Advisor|Domain|Develops ESG strategies and sustainability frameworks
logistics-optimizer|Logistics Optimizer|Domain|Optimizes shipping, routing, and warehouse operations
hospitality-consultant|Hospitality Consultant|Domain|Advises on hotel, restaurant, and tourism operations
media-strategist|Media Strategist|Domain|Plans multi-channel media campaigns and placements
agriculture-tech|Agriculture Tech Specialist|Domain|Applies technology to farming, crop analysis, and agri-logistics
government-specialist|Government Specialist|Domain|Navigates government procurement, policy, and compliance
nonprofit-advisor|Nonprofit Advisor|Domain|Advises on nonprofit strategy, fundraising, and governance
sports-analytics|Sports Analytics Specialist|Domain|Analyzes athletic performance and sports business data
insurance-underwriter|Insurance Underwriter|Domain|Evaluates risk and structures insurance coverage
telecom-engineer|Telecom Engineer|Domain|Designs and optimizes telecommunications networks
kubernetes-operator|Kubernetes Operator|Infrastructure|Manages Kubernetes clusters, workloads, and scaling
terraform-engineer|Terraform Engineer|Infrastructure|Provisions and manages infrastructure as code with Terraform
monitoring-specialist|Monitoring Specialist|Infrastructure|Implements observability, alerting, and logging systems
incident-responder|Incident Responder|Infrastructure|Leads incident response, triage, and post-mortems
capacity-planner|Capacity Planner|Infrastructure|Forecasts and plans infrastructure capacity needs
disaster-recovery|Disaster Recovery Specialist|Infrastructure|Designs backup, failover, and recovery strategies
network-engineer|Network Engineer|Infrastructure|Designs and troubleshoots network architectures
load-balancer|Load Balancer Specialist|Infrastructure|Configures traffic distribution and high availability
cdn-optimizer|CDN Optimizer|Infrastructure|Optimizes content delivery and edge caching strategies
cost-optimizer|Cost Optimizer|Infrastructure|Reduces cloud and infrastructure spending without sacrificing quality
SKILLS_EOF

# ─── Category → domain-specific workflow steps & QA items ───
# These provide richer, domain-aware content for packs

get_workflow() {
  local cat="$1"
  case "$cat" in
    Engineering)
      echo "1. Analyze the technical requirements and constraints.
2. Research existing patterns and prior art in the codebase.
3. Implement the solution with clean, tested code.
4. Run tests and verify no regressions.
5. Document changes and update relevant specs."
      ;;
    "Data & AI")
      echo "1. Define the problem statement and success metrics.
2. Explore and validate available data sources.
3. Build and iterate on the solution pipeline.
4. Evaluate results against benchmarks and baselines.
5. Document methodology, limitations, and deployment steps."
      ;;
    Creative)
      echo "1. Review the creative brief and brand guidelines.
2. Research references, trends, and inspiration.
3. Produce initial concepts and variations.
4. Refine based on feedback and quality standards.
5. Deliver final assets in required formats."
      ;;
    Business)
      echo "1. Frame the business question and scope the analysis.
2. Gather data from internal and external sources.
3. Analyze findings using appropriate frameworks.
4. Synthesize recommendations with supporting evidence.
5. Present actionable insights with clear next steps."
      ;;
    Content)
      echo "1. Understand the target audience and content goals.
2. Research the topic thoroughly from authoritative sources.
3. Draft content following the style guide and tone.
4. Edit for clarity, accuracy, and engagement.
5. Finalize with proper formatting and metadata."
      ;;
    Design)
      echo "1. Understand user needs and business requirements.
2. Audit existing design patterns and constraints.
3. Create designs following the design system.
4. Validate with user feedback or design review.
5. Deliver production-ready specs and assets."
      ;;
    Research)
      echo "1. Define the research question and methodology.
2. Identify and collect relevant data sources.
3. Analyze data using appropriate methods.
4. Synthesize findings into coherent insights.
5. Present results with confidence levels and limitations."
      ;;
    Support)
      echo "1. Understand the user's issue or need completely.
2. Research the solution in knowledge base and docs.
3. Provide a clear, empathetic, and accurate response.
4. Verify the resolution addresses the root cause.
5. Document the interaction for future reference."
      ;;
    Legal)
      echo "1. Identify the legal question and applicable jurisdiction.
2. Research relevant laws, regulations, and precedents.
3. Analyze risks, obligations, and compliance requirements.
4. Draft clear, precise legal guidance or documents.
5. Flag items requiring human attorney review."
      ;;
    Domain)
      echo "1. Understand the domain-specific context and constraints.
2. Research industry standards and best practices.
3. Apply domain expertise to the specific challenge.
4. Validate recommendations against industry benchmarks.
5. Deliver actionable, domain-informed guidance."
      ;;
    Infrastructure)
      echo "1. Assess current infrastructure state and requirements.
2. Design the solution following infrastructure-as-code principles.
3. Implement changes with proper testing and rollback plans.
4. Monitor for stability, performance, and cost impact.
5. Document runbooks and operational procedures."
      ;;
    *)
      echo "1. Understand the task requirements and context.
2. Gather necessary information and resources.
3. Execute the work following best practices.
4. Validate the output against quality standards.
5. Document results and any follow-up items."
      ;;
  esac
}

get_qa_items() {
  local cat="$1" id="$2"
  case "$cat" in
    Engineering)
      cat << 'QA'
- Code compiles and passes all existing tests
- No regressions introduced in related functionality
- Follows project coding standards and conventions
- Edge cases and error paths are handled
- Changes are documented with clear commit messages
QA
      ;;
    "Data & AI")
      cat << 'QA'
- Data inputs are validated and edge cases handled
- Model performance meets defined acceptance criteria
- No data leakage between training and evaluation sets
- Results are reproducible with documented parameters
- Bias and fairness checks have been performed
QA
      ;;
    Creative)
      cat << 'QA'
- Output aligns with brand guidelines and brief
- Assets are delivered in correct formats and resolutions
- Visual hierarchy and composition are effective
- Accessibility requirements are met (contrast, alt text)
- Creative rationale is documented
QA
      ;;
    Business)
      cat << 'QA'
- Analysis is grounded in verified data, not assumptions
- Recommendations include supporting evidence and trade-offs
- Financial projections use conservative base cases
- Stakeholder impacts are identified and addressed
- Action items are specific, measurable, and time-bound
QA
      ;;
    Content)
      cat << 'QA'
- Content is factually accurate with cited sources
- Tone and style match the target audience
- Grammar, spelling, and formatting are polished
- SEO requirements are met (if applicable)
- Content serves its stated purpose and call-to-action
QA
      ;;
    Design)
      cat << 'QA'
- Design follows the established design system
- Accessibility standards (WCAG 2.1 AA) are met
- Responsive behavior is defined for all breakpoints
- Interactive states are specified (hover, focus, disabled)
- Design tokens and specs are developer-ready
QA
      ;;
    Research)
      cat << 'QA'
- Sources are credible and properly cited
- Methodology is transparent and appropriate
- Findings distinguish correlation from causation
- Confidence levels and limitations are stated
- Research is actionable, not just informational
QA
      ;;
    Support)
      cat << 'QA'
- Response addresses the user's actual problem
- Tone is empathetic and professional
- Solution is verified to work before delivery
- Escalation criteria are followed when needed
- Knowledge base is updated with new learnings
QA
      ;;
    Legal)
      cat << 'QA'
- Analysis cites applicable laws and regulations
- Risks are clearly identified with severity levels
- Recommendations distinguish advice from legal opinion
- Confidentiality and privilege considerations are noted
- Items requiring human attorney review are flagged
QA
      ;;
    Domain)
      cat << 'QA'
- Domain-specific terminology is used correctly
- Industry standards and regulations are referenced
- Recommendations account for domain constraints
- Cross-domain impacts are identified
- Guidance is actionable within the specific industry
QA
      ;;
    Infrastructure)
      cat << 'QA'
- Changes follow infrastructure-as-code principles
- Rollback plan is documented and tested
- Security groups and access controls are reviewed
- Monitoring and alerting cover the new components
- Cost impact is estimated and acceptable
QA
      ;;
    *)
      cat << 'QA'
- Output matches the requested format and scope
- No hallucinated data or references
- Follows Porter architecture conventions
- Deliverable is ship-complete, not a stub
QA
      ;;
  esac
}

get_prompt_notes() {
  local cat="$1" id="$2" name="$3"
  case "$cat" in
    Engineering)
      echo "- Write production-quality code, never pseudocode.
- Follow the project's existing patterns and conventions.
- Include error handling and edge case coverage.
- Prefer small, focused changes over large rewrites."
      ;;
    "Data & AI")
      echo "- Show your analytical reasoning step by step.
- Distinguish between correlation and causation.
- Quantify uncertainty in all predictions and estimates.
- Validate assumptions against available data."
      ;;
    Creative)
      echo "- Maintain brand consistency across all outputs.
- Explain creative decisions with clear rationale.
- Provide multiple options when the brief allows it.
- Consider the end medium and technical constraints."
      ;;
    Business)
      echo "- Ground all analysis in verified data and sources.
- Present recommendations with clear trade-offs.
- Use established business frameworks where appropriate.
- Quantify impact in terms stakeholders care about."
      ;;
    Content)
      echo "- Write for the target audience, not yourself.
- Use active voice and clear sentence structure.
- Back claims with credible sources and data.
- Optimize for the intended distribution channel."
      ;;
    Design)
      echo "- Follow the design system strictly — no one-off styles.
- Design for accessibility from the start, not as an afterthought.
- Consider all interaction states and edge cases.
- Deliver specs that developers can implement without guessing."
      ;;
    Research)
      echo "- State methodology and limitations upfront.
- Cite all sources with enough detail to verify.
- Distinguish between established facts and interpretations.
- Present findings in order of confidence and relevance."
      ;;
    Support)
      echo "- Lead with empathy — acknowledge the user's frustration.
- Provide step-by-step solutions, not vague guidance.
- Verify solutions work before presenting them.
- Know when to escalate instead of guessing."
      ;;
    Legal)
      echo "- This is informational analysis, not legal advice.
- Cite specific statutes, regulations, and precedents.
- Clearly flag items requiring licensed attorney review.
- Distinguish between jurisdictions when applicable."
      ;;
    Domain)
      echo "- Apply deep domain knowledge, not generic advice.
- Reference industry-specific standards and benchmarks.
- Account for regulatory constraints of the domain.
- Translate domain complexity into actionable guidance."
      ;;
    Infrastructure)
      echo "- Infrastructure as code — no manual changes.
- Always include rollback procedures.
- Security and least-privilege access by default.
- Monitor cost impact of every infrastructure change."
      ;;
    *)
      echo "- Produce artifacts, not generic advice.
- Follow Porter conventions and architecture.
- Keep outputs concise, but ship-complete."
      ;;
  esac
}

# ─── Main loop: process each skill ───

echo "=== Porter Skills Expansion ==="
echo "Skills directory: $SKILLS_DIR"
echo ""

while IFS='|' read -r id name category description; do
  # Skip blank lines
  [[ -z "$id" ]] && continue

  # Check if already exists
  if skill_exists "$id"; then
    echo "SKIP  $id (already in DB)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "CREATE $id ($category)"

  # ── 1. Insert into DB ──
  # Escape single quotes for SQL
  esc_name="${name//\'/\'\'}"
  esc_desc="${description//\'/\'\'}"
  esc_cat="${category//\'/\'\'}"

  psql -d "$DB" -q -c "
    INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, sort_order, pack_status)
    VALUES ('$id', '$esc_name', '$esc_desc', '$esc_cat', 'porter-curated', 1, 1, 0, 50, 'complete')
    ON CONFLICT (id) DO NOTHING;
  "

  # ── 2. Create on-disk pack ──
  pack_dir="$SKILLS_DIR/$id"
  mkdir -p "$pack_dir/assets" "$pack_dir/examples" "$pack_dir/guides" "$pack_dir/meta"

  # SKILL.md
  workflow=$(get_workflow "$category")
  cat > "$pack_dir/SKILL.md" << SKILLEOF
---
name: $name
description: $description
category: $category
source: porter-curated
---

# $name

## Purpose
$description

## When to use
- When a project requires $name capabilities
- When Porter delegates work matching the $category domain
- When specialized $category expertise is needed for a task
- When quality standards demand domain-specific knowledge

## Inputs
- Task context from Porter dispatch
- Relevant project/workspace data
- Domain-specific requirements and constraints

## Outputs
- Completed artifact matching the skill's domain
- Quality-checked deliverable ready for review
- Documentation of approach and decisions made

## Primary workflow
$workflow

## Guardrails
- Stay inside Porter's architecture.
- Prefer concrete deliverables over vague suggestions.
- Keep outputs concise, but ship-complete.
- Flag uncertainty rather than hallucinating answers.

## References
- prompt.md
- guides/qa-checklist.md
- examples/
- meta/skill.json
SKILLEOF

  # prompt.md
  prompt_notes=$(get_prompt_notes "$category" "$id" "$name")
  cat > "$pack_dir/prompt.md" << PROMPTEOF
# Prompting Guide — $name

## System intent
Operate as $name. $description

## Required behaviors
- Produce artifacts, not generic advice
- Stay within the $category domain
- Follow Porter conventions

## Domain-specific guidance
$prompt_notes

## Porter-specific notes
- Prefer existing DB state over hardcoded assumptions.
- Keep outputs concise, but ship-complete.
- Coordinate with other skills via Porter's dispatch system.
PROMPTEOF

  # guides/qa-checklist.md
  qa_items=$(get_qa_items "$category" "$id")
  cat > "$pack_dir/guides/qa-checklist.md" << QAEOF
# QA Checklist — $name

$qa_items
QAEOF

  # examples/README.md
  cat > "$pack_dir/examples/README.md" << EXEOF
# Examples

- none yet
EXEOF

  # meta/skill.json
  cat > "$pack_dir/meta/skill.json" << JSONEOF
{
  "id": "$id",
  "name": "$name",
  "description": "$description",
  "category": "$category",
  "source": "porter-curated",
  "generated_at": "$NOW"
}
JSONEOF

  CREATED=$((CREATED + 1))

done <<< "$SKILLS_DATA"

echo ""
echo "=== Done ==="
echo "Created: $CREATED"
echo "Skipped: $SKIPPED"
echo "Total skills in DB:"
psql -d "$DB" -t -A -c "SELECT COUNT(*) FROM skills;"
echo "Total skill directories:"
ls -d "$SKILLS_DIR"/*/ 2>/dev/null | grep -v '^_' | wc -l
