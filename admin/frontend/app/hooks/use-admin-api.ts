import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"

// ── Customers ──────────────────────────────────────────

export interface Customer {
  username: string
  display_name: string | null
  full_name?: string | null
  email: string | null
  role: string | null
  email_verified: number
  status: string
  created_at: number | null
  plan: string
  sub_status: string
  trial_ends_at?: number | null
  lifetime_free: number
  suspended_at: number | null
  active_sessions: number
  last_seen_at: number | null
  project_count: number
  chat_count?: number
  agent_count: number
  pipeline_stage: string | null
  tags: string[]
  // Computed by customer-intel
  mrr: number
  cost: number
  margin: number
  health: number
  conversion: number
  churn: number
  viral: number
  ltv: number
  nextAction: { text: string; agent: string; actionType: string; priority: number }
  loginCount: number
  shareCount: number
  invitesSent: number
  invitesConverted: number
}

interface CustomerListResponse {
  customers: Customer[]
  stats: {
    total: number
    paying: number
    trialing: number
    free: number
    suspended: number
    preLaunch: boolean
    totalAllUsers: number
  }
}

export interface CustomerDetailResponse {
  customer: {
    username: string
    display_name: string | null
    full_name: string | null
    email: string | null
    role: string | null
    created_at: number | null
    plan: string
    sub_status: string
    trial_ends_at: number | null
    last_seen_at: number | null
    active_sessions: number
    unique_ips: number
    project_count: number
    chat_count: number
    agent_count: number
    lifetime_free: number
    suspended_at: number | null
    suspension_reason: string | null
    phone: string | null
    company: string | null
    job_title: string | null
    country: string | null
    city: string | null
    timezone: string | null
    language: string | null
    bio: string | null
    signup_source: string | null
    social_x: string | null
    social_linkedin: string | null
    social_github: string | null
    avatar_url: string | null
    email_verified: number
    terms_accepted_at: number | null
    last_ip: string | null
  }
  scores: {
    health: number
    conversion: number
    churn: number
    viral: number
    ltv: number
    nextAction: { text: string; agent: string; actionType: string; priority: number }
    mrr: number
    cost: number
    margin: number
    loginCount: number
    shareCount: number
    invitesSent: number
    invitesConverted: number
    healthFactors: string[]
    conversionFactors: string[]
    churnFactors: string[]
    viralFactors: string[]
  }
  stage: string
  subscription: {
    plan: string
    status: string
    trialEndsAt: number | null
    currentPeriodStart: number | null
    currentPeriodEnd: number | null
    cancelAt: number | null
    pausedAt: number | null
    createdAt: number | null
  } | null
  billingHistory: Array<{
    id: number
    eventType: string
    payload: Record<string, unknown>
    createdAt: number
  }>
  preLaunch: boolean
  totalUsers: number
  loginHistory: Array<{
    ip_address: string | null
    country: string | null
    created_at: number
  }>
  anomalies: string[]
  recentProjects: Array<{ name: string; status: string }>
  pendingTasks: Array<{
    id: number
    agent_type: string
    action_type: string
    status: string
    priority: number
    created_at: number
  }>
  userAgents: Array<{
    id: string
    name: string
    role: string
    status: string
    created_at: string
  }>
}

// Plan display label helper
export function planDisplayLabel(
  customer: { plan: string; sub_status: string; trial_ends_at?: number | null; lifetime_free?: number },
  preLaunch?: boolean
): string {
  if (customer.lifetime_free) return "Free (lifetime)"
  if (preLaunch) return "Free (pre-launch)"
  if (customer.sub_status === "trialing" && customer.trial_ends_at) {
    const daysLeft = Math.max(0, Math.ceil((customer.trial_ends_at - Date.now() / 1000) / 86400))
    return `Trial (${daysLeft}d left)`
  }
  if (customer.sub_status === "trialing") return "Trial"
  if (customer.plan === "cloud" && customer.sub_status === "active") return "Cloud ($5/mo)"
  if (customer.plan === "cloud_team" && customer.sub_status === "active") return "Team"
  if (customer.plan === "enterprise" && customer.sub_status === "active") return "Enterprise"
  return "Free"
}

export function useCustomers() {
  return useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => api<CustomerListResponse>("/api/admin/users"),
  })
}

export function useCustomerDetail(username: string) {
  return useQuery({
    queryKey: ["admin", "customers", username],
    queryFn: () => api<CustomerDetailResponse>(`/api/admin/users/${username}`),
    enabled: !!username,
  })
}

export function useSuspendUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, reason }: { username: string; reason?: string }) =>
      api(`/api/admin/users/${username}/suspend`, { method: "PUT", json: { reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  })
}

export function useUnsuspendUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) =>
      api(`/api/admin/users/${username}/unsuspend`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  })
}

export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, ...data }: { username: string; plan?: string; status?: string; lifetime_free?: boolean; trial_days?: number }) =>
      api(`/api/admin/users/${username}/subscription`, { method: "PUT", json: data }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "customers", vars.username] })
      qc.invalidateQueries({ queryKey: ["admin", "customers"] })
    },
  })
}

export function useUpdatePipelineStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, stage }: { username: string; stage: string }) =>
      api<{ username: string; pipeline_stage: string }>(
        `/api/admin/customers/${username}/stage`,
        { method: "PATCH", json: { stage } }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  })
}

export interface ActivityEvent {
  type: string
  action: string
  detail: string
  ts: number
}

export function useCustomerActivity(username: string) {
  return useQuery({
    queryKey: ["admin", "customers", username, "activity"],
    queryFn: () => api<{ events: ActivityEvent[] }>(`/api/admin/users/${username}/activity`),
    enabled: !!username,
    
  })
}

// ── Services ───────────────────────────────────────────

interface ServiceStatus {
  name: string
  url: string
  status: "healthy" | "down"
  latencyMs: number
}

interface ServicesResponse {
  services: ServiceStatus[]
  db: { size: number; walSize: number; tables: number }
}

export function useServices() {
  return useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<ServicesResponse>("/api/admin/services"),
    
  })
}

// ── Health ─────────────────────────────────────────────

export function useHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<{ status: string; service: string; db: string }>("/api/admin/health"),
  })
}

// ── Email ──────────────────────────────────────────────

export function useEmailConfig() {
  return useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api<{ configured: boolean }>("/api/admin/email/config"),
  })
}

export function useEmailQueue() {
  return useQuery({
    queryKey: ["admin", "email", "queue"],
    queryFn: () => api<{ pending: number; sent: number; failed: number }>("/api/admin/email/queue"),
  })
}

// ── Customer Annotations ────────────────────────────────

export interface CustomerNote {
  id: string
  username: string
  content: string
  created_by: string
  created_at: number
  updated_at: number
}

export interface CustomerTask {
  id: string
  username: string
  title: string
  assignee: string | null
  due_date: string | null
  status: 'open' | 'done' | 'cancelled'
  created_by: string
  created_at: number
  updated_at: number
}

export function useCustomerNotes(username: string) {
  return useQuery({
    queryKey: ["customer-notes", username],
    queryFn: () => api<{ notes: CustomerNote[] }>(`/api/admin/customers/${username}/notes`),
    enabled: !!username,
  })
}

export function useCustomerTasks(username: string) {
  return useQuery({
    queryKey: ["customer-tasks", username],
    queryFn: () => api<{ tasks: CustomerTask[] }>(`/api/admin/customers/${username}/tasks`),
    enabled: !!username,
  })
}

export function useAddNote(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      api<{ note: CustomerNote }>(`/api/admin/customers/${username}/notes`, {
        method: "POST",
        json: { content },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-notes", username] })
      qc.invalidateQueries({ queryKey: ["customer-timeline", username] })
    },
  })
}

export function useDeleteNote(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) =>
      api(`/api/admin/customers/${username}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-notes", username] }),
  })
}

export function useAddTask(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; assignee?: string; due_date?: string }) =>
      api<{ task: CustomerTask }>(`/api/admin/customers/${username}/tasks`, {
        method: "POST",
        json: body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tasks", username] })
      qc.invalidateQueries({ queryKey: ["customer-timeline", username] })
    },
  })
}

export function usePatchTask(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: 'open' | 'done' | 'cancelled' }) =>
      api<{ task: CustomerTask }>(`/api/admin/customers/${username}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tasks", username] })
      qc.invalidateQueries({ queryKey: ["customer-timeline", username] })
    },
  })
}

export function useDeleteTask(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) =>
      api(`/api/admin/customers/${username}/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-tasks", username] }),
  })
}

// ── Customer Timeline ──────────────────────────────────

export interface TimelineEvent {
  id: string
  source_type: 'note' | 'task' | 'login' | 'chat' | 'agent'
  source_label: string
  ts: number
  content: string
  meta: Record<string, unknown>
}

export function useCustomerTimeline(username: string) {
  return useQuery({
    queryKey: ["customer-timeline", username],
    queryFn: () => api<{ events: TimelineEvent[] }>(`/api/admin/customers/${username}/timeline`),
    enabled: !!username,
    
  })
}

// ── Customer Tags ────────────────────────────────────────

export function useCustomerTags(username: string) {
  return useQuery({
    queryKey: ["customer-tags", username],
    queryFn: () => api<{ tags: string[] }>(`/api/admin/customers/${username}/tags`),
    enabled: !!username,
  })
}

export function useAddTag(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tag: string) =>
      api<{ tags: string[] }>(`/api/admin/customers/${username}/tags/${encodeURIComponent(tag)}`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tags", username] })
      qc.invalidateQueries({ queryKey: ["admin", "customers"] })
      qc.invalidateQueries({ queryKey: ["admin", "customers", username] })
    },
  })
}

export function useRemoveTag(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tag: string) =>
      api(`/api/admin/customers/${username}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tags", username] })
      qc.invalidateQueries({ queryKey: ["admin", "customers"] })
      qc.invalidateQueries({ queryKey: ["admin", "customers", username] })
    },
  })
}

// ── Admin Segments ────────────────────────────────────────

export interface AdminSegment {
  id: string
  name: string
  filters: {
    status?: string
    tags?: string[]
    joinedAfter?: string
    joinedBefore?: string
    search?: string
  }
  created_by: string
  created_at: number
  updated_at: number
}

export function useSegments() {
  return useQuery({
    queryKey: ["admin", "segments"],
    queryFn: () => api<{ segments: AdminSegment[] }>("/api/admin/customers/segments"),
  })
}

export function useCreateSegment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: AdminSegment["filters"] }) =>
      api<{ segment: AdminSegment }>("/api/admin/customers/segments", {
        method: "POST",
        json: { name, filters },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "segments"] }),
  })
}

export function useDeleteSegment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/customers/segments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "segments"] }),
  })
}

// ── Customer Conversations ─────────────────────────────

export interface ConversationStep {
  run_id: string
  from_agent: string
  to_agent: string
  message: string
  response: string | null
  status: string
  step_num: number
  created_at: number
  error: string | null
  model: string | null
  chain_id: string
}

export interface ConversationThread {
  chain_id: string
  started_at: number
  last_activity_at: number
  step_count: number
  agents_involved: string[]
  steps: ConversationStep[]
}

export function useCustomerConversations(username: string) {
  return useQuery({
    queryKey: ["customer-conversations", username],
    queryFn: () => api<{ conversations: ConversationThread[] }>(`/api/admin/customers/${username}/conversations`),
    enabled: !!username,
    
  })
}
