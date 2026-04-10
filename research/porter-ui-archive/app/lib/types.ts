export interface User {
  username: string
  displayName: string
  role: "admin" | "operator" | "viewer"
  email?: string
}

export interface Project {
  id: string
  name: string
  slug: string
  type: "custom" | "website" | "app" | "content" | "research" | "design" | "ops"
  status: "active" | "paused" | "complete" | "archived"
  description: string | null
  owner_id: string
  milestones: Milestone[]
  artifacts: Artifact[]
  links: ProjectLink[]
  metadata: Record<string, unknown>
  deadline: string | null
  created_at: number
  updated_at: number
}

export interface Milestone {
  id: string
  title: string
  done: boolean
}

export interface Artifact {
  id: string
  title: string
  type: string
  path?: string
}

export interface ProjectLink {
  id: string
  label: string
  url: string
}

export interface Agent {
  id: string
  name: string
  role: string
  avatar: string
  status: "idle" | "active" | "waiting" | "retired"
  agent_group: string
  preferred_backend: string | null
  fallback_backends: string[]
  owner: string
  is_system: boolean
  is_public: boolean
  is_locked: boolean
  is_master: boolean
  orchestrator_only: boolean
  is_temporary: boolean
  managed_by_porter: boolean
  appearance_style: string
  appearance_spec: Record<string, unknown>
  skin_asset_path: string
  portrait_asset_path: string
  sort_order: number
  created_at: string
  last_active: string | null
  heartbeat_enabled: boolean
  heartbeat_cron: string
  last_heartbeat: string | null
  config: Record<string, unknown>
  description: string
  skills: string[]
  tools: string[]
  awareness_mode: "aware" | "unaware"
}

export interface Job {
  id: string
  agent_id: string
  project_id: string | null
  parent_agent_id: string | null
  trigger_type: "manual" | "scheduled" | "event" | "deadline"
  trigger_data: Record<string, unknown>
  prompt: string
  status: "pending" | "running" | "complete" | "failed" | "cancelled"
  scheduled_for: number
  started_at: number | null
  completed_at: number | null
  worker_id: string | null
  attempt_count: number
  result: string | null
  error: string | null
  created_at: string
}

export interface ActivityEvent {
  id: number
  agent_id: string
  agent_name?: string
  agent_role?: string
  agent_avatar?: string
  job_id: string | null
  project_id: string | null
  event_type: string
  summary: string
  detail: Record<string, unknown> | null
  created_at: string
}

export interface HealthBackend {
  name: string
  url: string
  model: string
  status: "up" | "down" | "unknown"
  latencyMs: number | null
}

export interface HealthData {
  backends: HealthBackend[]
  database: { status: "up" | "down"; latencyMs: number | null }
  tokenUsage: TokenUsage[]
  checkedAt: string
}

export interface TokenUsage {
  model: string
  total_input: number
  total_output: number
  total_requests: number
}

export interface Decision {
  id: number
  decision_type: string
  chosen: string
  reasoning: string
  alternatives: string[]
  project_id: string | null
  agent_id: string | null
  job_id: string | null
  created_at: string
}

export interface WizardDetectResult {
  isProject: boolean
  clarity: "clear" | "vague" | "ambiguous"
  suggestedQuestions: WizardQuestion[]
}

export interface WizardQuestion {
  id: string
  text: string
  options: { id: string; label: string; description?: string }[]
}

export interface WizardProposal {
  projectName: string
  projectType: string
  agents: {
    templateId: string
    name: string
    role: string
    portrait?: string
    whyChosen: string
  }[]
  milestones: string[]
  scopeLabel: string
  explanation?: string
}
