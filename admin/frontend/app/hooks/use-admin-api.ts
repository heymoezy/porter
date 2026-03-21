import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"

// ── Customers ──────────────────────────────────────────

export interface Customer {
  username: string
  display_name: string | null
  full_name?: string | null
  email: string | null
  role: string | null
  created_at: number | null
  plan: string
  sub_status: string
  trial_ends_at?: number | null
  active_sessions: number
  last_seen_at: number | null
  project_count: number
  chat_count?: number
  agent_count: number
  // Computed by customer-intel
  mrr: number
  cost: number
  margin: number
  health: number
  conversion: number
  churn: number
  viral: number
  ltv: number
  nextAction: string
  loginCount: number
  shareCount: number
  invitesSent: number
  invitesConverted: number
}

interface CustomerListResponse {
  customers: Customer[]
  stats: { total: number; paying: number; trialing: number; free: number }
}

interface CustomerDetailResponse {
  customer: {
    username: string
    display_name: string | null
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
  }
  scores: {
    health: number
    conversion: number
    churn: number
    viral: number
    ltv: number
    nextAction: string
    mrr: number
    cost: number
    margin: number
    loginCount: number
    shareCount: number
    invitesSent: number
    invitesConverted: number
  }
  stage: string
  tokensByModel: Array<{
    model: string
    inputTokens: number
    outputTokens: number
    requests: number
    cost: number
  }>
  loginHistory: Array<{
    ip_address: string | null
    country: string | null
    created_at: number
  }>
  anomalies: string[]
  recentProjects: Array<{ name: string; status: string }>
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

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, role }: { username: string; role: string }) =>
      api(`/api/admin/users/${username}/role`, { method: "PUT", json: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (username: string) =>
      api(`/api/admin/users/${username}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
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
    refetchInterval: 30_000,
  })
}

// ── Health ─────────────────────────────────────────────

export function useHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<{ status: string; service: string; db: string }>("/api/admin/health"),
  })
}

// ── Billing ────────────────────────────────────────────

export function useBillingSubscriptions() {
  return useQuery({
    queryKey: ["admin", "billing", "subscriptions"],
    queryFn: () => api<{ subscriptions: Array<Record<string, unknown>> }>("/api/admin/billing/subscriptions"),
  })
}

export function useBillingStats() {
  return useQuery({
    queryKey: ["admin", "billing", "stats"],
    queryFn: () => api<{ total: number; active: number; trialing: number }>("/api/admin/billing/stats"),
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
