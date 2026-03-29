import { useState, useEffect } from "react"
import { Outlet } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { VERSION } from "~/lib/constants"
import { PixelPortrait } from "~/components/pixel-portrait"
import { queryClient } from "~/lib/query-client"
import { api } from "~/lib/api"

/**
 * Preloader that ACTUALLY works:
 * - Uses queryClient.prefetchQuery() so data lands in React Query cache
 * - Pages mount and find warm cache → render instantly (staleTime: 60s)
 * - Runs EVERY time (not just first visit)
 */
function usePreloader() {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("Waking up...")
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function preload() {
      try {
        // Step 1: Prefetch into React Query cache (pages will read from this)
        setStatus("Loading data...")
        setProgress(15)

        // Query keys MUST exactly match what useQuery() uses in each page
        const prefetches = [
          // Dashboard (home.tsx)
          queryClient.prefetchQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api("/api/admin/health/dashboard") }),
          queryClient.prefetchQuery({ queryKey: ["admin", "system"], queryFn: () => api("/api/admin/system") }),
          queryClient.prefetchQuery({ queryKey: ["admin", "logs"], queryFn: () => api("/api/admin/health/logs?limit=30") }),
          // Brain
          queryClient.prefetchQuery({ queryKey: ["brain", "system"], queryFn: () => api("/api/admin/system") }),
          queryClient.prefetchQuery({ queryKey: ["brain", "dashboard"], queryFn: () => api("/api/admin/health/dashboard") }),
          queryClient.prefetchQuery({ queryKey: ["brain", "diagnostics"], queryFn: () => api("/api/admin/diagnostics").catch(() => ({ errors: [], stats: {} })) }),
          queryClient.prefetchQuery({ queryKey: ["brain", "logs"], queryFn: () => api("/api/admin/health/logs?limit=30").catch(() => ({ logs: [] })) }),
          // Bridge
          queryClient.prefetchQuery({ queryKey: ["bridge", "gateway-cards"], queryFn: () => api("/api/admin/bridge").catch(() => ({ gateways: [], summary: {} })) }),
          queryClient.prefetchQuery({ queryKey: ["bridge", "all-models"], queryFn: () => api("/api/admin/bridge/models").catch(() => ({ models: [] })) }),
          // Activity
          queryClient.prefetchQuery({ queryKey: ["admin", "activity", null], queryFn: () => api("/api/admin/activity?limit=100").catch(() => []) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "activity", "learnings"], queryFn: () => api("/api/admin/activity/learnings").catch(() => []) }),
          // Skills, Tools, Customers, Diagnostics
          queryClient.prefetchQuery({ queryKey: ["admin", "skills"], queryFn: () => api("/api/admin/skills").catch(() => ({ skills: [] })) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "tools"], queryFn: () => api("/api/admin/tools").catch(() => []) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "tools", "connections"], queryFn: () => api("/api/admin/tools/connections").catch(() => []) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "customers"], queryFn: () => api("/api/admin/customers").catch(() => []) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "diagnostics"], queryFn: () => api("/api/admin/diagnostics").catch(() => ({ errors: [], stats: {} })) }),
          // Billing, Email
          queryClient.prefetchQuery({ queryKey: ["admin", "billing", "subscriptions"], queryFn: () => api("/api/admin/billing/subscriptions").catch(() => []) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "billing", "stats"], queryFn: () => api("/api/admin/billing/stats").catch(() => {}) }),
          queryClient.prefetchQuery({ queryKey: ["admin", "email", "config"], queryFn: () => api("/api/admin/email/config").catch(() => ({})) }),
          // Recall
          queryClient.prefetchQuery({ queryKey: ["recall", "concepts", "all", "all", ""], queryFn: () => api("/api/v1/memory/concepts?limit=100").catch(() => ({ concepts: [], count: 0 })) }),
          // Forge
          queryClient.prefetchQuery({ queryKey: ["forge", "state"], queryFn: () => api("/api/admin/forge").catch(() => ({})) }),
        ]

        await Promise.all(prefetches)
        if (cancelled) return
        setProgress(90)
        setStatus("Almost ready...")

        await new Promise(r => setTimeout(r, 200))
        if (cancelled) return
        setProgress(100)
        setStatus("Ready")

        await new Promise(r => setTimeout(r, 300))
        if (!cancelled) setFadeOut(true)
        await new Promise(r => setTimeout(r, 400))
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) setReady(true)
      }
    }

    preload()
    return () => { cancelled = true }
  }, [])

  return { ready, progress, status, fadeOut }
}

function PreloadScreen({ progress, status, fadeOut }: { progress: number; status: string; fadeOut: boolean }) {
  const [dots, setDots] = useState("")

  useEffect(() => {
    const i = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400)
    return () => clearInterval(i)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-500"
      style={{ opacity: fadeOut ? 0 : 1 }}
    >
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative flex flex-col items-center gap-6">
        <div
          className="transition-all duration-700"
          style={{
            filter: progress === 100
              ? "drop-shadow(0 0 20px rgba(99, 102, 241, 0.4))"
              : "drop-shadow(0 0 8px rgba(99, 102, 241, 0.15))",
            transform: progress === 100 ? "scale(1.1)" : "scale(1)",
          }}
        >
          <PixelPortrait skin="#E0AC69" hair="#2C1B18" eyes="#334155" shirt="#6366F1" hairStyle="short" size="lg" />
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-foreground tracking-tight">Porter</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">v{VERSION}</div>
        </div>
        <div className="w-56">
          <div className="h-[3px] bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : "linear-gradient(90deg, #6366f1, #818cf8)",
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">{status}{progress < 100 ? dots : ""}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthenticatedLayout() {
  const { ready, progress, status, fadeOut } = usePreloader()

  if (!ready) {
    return <PreloadScreen progress={progress} status={status} fadeOut={fadeOut} />
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
