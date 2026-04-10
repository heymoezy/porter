import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"

interface SessionData {
  username: string
  displayName: string
  fullName?: string | null
  role: string
  email?: string
  avatarUrl?: string | null
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () =>
      api<SessionData>("/api/v1/auth/me").catch(() => null),
    staleTime: 60_000,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any[]>("/api/v1/projects"),
  })
}

interface AgentData {
  id: string
  name: string
  role: string
  status: string
  agent_group: string
  description: string
  skills: string[]
  tools: string[]
  is_master: boolean
  is_system: boolean
  appearance_spec: Record<string, string>
  created_at: string
  last_active: string | null
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await api<{ agents: AgentData[]; count: number }>("/api/v1/agents")
      return res
    },
    select: (d) => d.agents,
  })
}

interface TemplateData {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
  skills: string[]
  tools: string[]
  is_internal: boolean
  sort_order: number
  created_at: number | null
}

export function useTemplates(category?: string) {
  return useQuery({
    queryKey: ["templates", category ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({ include_internal: "true", limit: "500" })
      if (category && category !== "all") params.set("category", category)
      const res = await api<{ templates: TemplateData[]; total: number }>(`/api/v1/templates?${params}`)
      return res
    },
    select: (d) => d.templates,
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>("/api/v1/health"),
    refetchInterval: 30_000,
  })
}

export function useDecisions(limit = 50) {
  return useQuery({
    queryKey: ["decisions", limit],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>(`/api/v1/decisions?limit=${limit}`),
  })
}

export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>("/api/v1/connections"),
  })
}

export function useConcepts(q?: string, scope?: string) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (scope) params.set("scope", scope)
  const qs = params.toString()
  return useQuery({
    queryKey: ["concepts", q ?? "", scope ?? ""],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>(`/api/v1/memory/concepts${qs ? `?${qs}` : ""}`),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api("/api/v1/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear()
      window.location.href = "/login"
    },
  })
}

// --- Chat -------------------------------------------------------------------

export function useChatSessions() {
  return useQuery({
    queryKey: ["chat-sessions"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>("/api/v1/chat/sessions"),
  })
}

export function useChatSessionAction() {
  const qc = useQueryClient()
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (body: { action: string; chat_id: string; title?: string }) =>
      api<any>("/api/v1/chat/sessions", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    },
  })
}

// --- Files ------------------------------------------------------------------

export function useFiles(root: string, path: string) {
  return useQuery({
    queryKey: ["files", root, path],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () =>
      api<any>(
        `/api/v1/files?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
      ),
    enabled: !!root,
  })
}

// --- Billing ----------------------------------------------------------------

interface BillingPlan {
  plan: string
  planName: string
  status: string
  isActive: boolean
  isTrial: boolean
  trialDaysLeft: number | null
  currentPeriodEnd: number | null
  cancelAt: number | null
  price: number
}

interface BillingUsage {
  totalTokens: number
  totalRequests: number
  projects: number
  agents: number
  byModel: Array<{ model: string; inputTokens: number; outputTokens: number; requests: number }>
  periodStart: string
  periodEnd: string
}

export interface BillingData {
  billing_enabled: boolean
  plan: BillingPlan
  usage: BillingUsage
}

export function useBilling() {
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => api<BillingData>("/api/v1/billing"),
    staleTime: 60_000,
  })
}

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: string) =>
      api<{ checkout_url: string }>("/api/v1/billing/checkout", {
        method: "POST",
        json: { plan },
      }),
  })
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: () =>
      api<{ portal_url: string }>("/api/v1/billing/portal", { method: "POST" }),
  })
}

// --- Preferences ------------------------------------------------------------

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api<any>("/api/v1/preferences"),
    staleTime: 60_000,
  })
}

export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (prefs: Record<string, any>) =>
      api<any>("/api/v1/preferences", { method: "POST", json: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preferences"] })
    },
  })
}

// --- Profile ----------------------------------------------------------------

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { display_name: string; full_name?: string; email?: string; avatar_url?: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      api<any>("/api/v1/profile", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session"] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { new_password: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      api<any>("/api/v1/auth/change-password", { method: "POST", json: body }),
  })
}
