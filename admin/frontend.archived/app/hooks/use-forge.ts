import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { api } from "~/lib/api"

interface ForgeStats {
  queued: number
  claimed: number
  complete: number
  error: number
  dead_letter: number
}

interface ForgeState {
  running: boolean
  currentWave: number
  tickIntervalMs: number
  dailyTokenBudget: number
  qualityThreshold: number
  stats: ForgeStats
  bornTemplateIds: string[]
  items: Array<{
    id: string
    template_id: string
    template_name: string | null
    category: string | null
    agent_id: string | null
    station: number
    status: string
    wave: number
    flags: string
    tokens_used: number
    quality_score: number | null
    started_at: number | null
    completed_at: number | null
    error: string | null
  }>
}

// SSE hook — connects to forge event stream
function useForgeSSE() {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource("/api/admin/forge/events")

    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["admin", "forge"] })
    }

    es.onerror = () => {
      // Reconnect handled by EventSource automatically
    }

    return () => es.close()
  }, [qc])
}

// State query
function useForgeState() {
  return useQuery({
    queryKey: ["admin", "forge"],
    queryFn: () => api<ForgeState>("/api/admin/forge"),
  })
}

// Wave summary
function useForgeWaveSummary() {
  return useQuery({
    queryKey: ["admin", "forge", "wave-summary"],
    queryFn: () => api<{ wave: number; total: number; complete: number; errors: number; tokens: number; avg_quality: number | null }>("/api/admin/forge/wave-summary"),
  })
}

// Mutations
function useForgeStart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api("/api/admin/forge/start", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api("/api/admin/forge/stop", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeApproveWave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api("/api/admin/forge/approve-wave", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeRetry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/admin/forge/${id}/retry`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { template_id?: string; template_ids?: string[]; wave?: number }) =>
      api<{ queued: number; total: number }>("/api/admin/forge/queue", { method: "POST", json: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeRemove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/admin/forge/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

function useForgeSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: { tickIntervalMs?: number; dailyTokenBudget?: number; qualityThreshold?: number }) =>
      api("/api/admin/forge/settings", { method: "PATCH", json: settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "forge"] }),
  })
}

export {
  useForgeSSE,
  useForgeState,
  useForgeWaveSummary,
  useForgeStart,
  useForgeStop,
  useForgeApproveWave,
  useForgeQueue,
  useForgeRemove,
  useForgeRetry,
  useForgeSettings,
}
export type { ForgeState, ForgeStats }
