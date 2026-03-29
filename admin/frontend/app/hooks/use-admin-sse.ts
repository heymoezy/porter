import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

// Minimal inline type for dispatch log cache — avoids cross-module import
type DispatchLogCache = { entries: unknown[]; pagination: { total: number; [k: string]: unknown } }

/**
 * Connects to Brain's SSE stream and invalidates React Query caches
 * when relevant events arrive. Fire-and-forget — reconnects automatically.
 */
export function useAdminSSE() {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource("/api/events")

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)

        switch (payload.type ?? payload.event) {
          case "profile:updated":
            // User changed their profile in the product — refresh their detail page
            if (payload.data?.username || payload.username) {
              const username = payload.data?.username ?? payload.username
              qc.invalidateQueries({ queryKey: ["admin", "customers", username] })
            }
            qc.invalidateQueries({ queryKey: ["admin", "customers"] })
            break

          case "agent:activity":
          case "agent:status":
            qc.invalidateQueries({ queryKey: ["admin", "customers"] })
            break

          case "bridge:health":
            // Gateway health changed — refresh gateway dashboard cards + capacity
            qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
            qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
            break

          case "bridge:usage":
            // Usage collector ran — refresh capacity bars in real-time
            qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
            break

          case "bridge:dispatch": {
            // Prepend new dispatch entry to the first page of the dispatch log cache
            const entry = payload.data?.entry ?? payload.entry
            if (!entry) break
            const key = ["bridge", "dispatch-log", 1, 50, "", "", ""]
            const existing = qc.getQueryData<DispatchLogCache>(key)
            if (existing) {
              qc.setQueryData<DispatchLogCache>(key, {
                ...existing,
                entries: [entry, ...existing.entries].slice(0, 50),
                pagination: {
                  ...existing.pagination,
                  total: existing.pagination.total + 1,
                },
              })
            } else {
              qc.invalidateQueries({ queryKey: ["bridge", "dispatch-log"] })
            }
            // Also refresh the agent-detail summary view + operator activity
            qc.invalidateQueries({ queryKey: ["bridge", "dispatch-log-summary"] })
            qc.invalidateQueries({ queryKey: ["bridge", "costs-summary"] })
            qc.invalidateQueries({ queryKey: ["bridge", "intel-recent"] })
            break
          }

          case "bridge:circuit-trip":
            // Circuit breaker opened — refresh gateway dashboard and notify dispatch log
            qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
            window.dispatchEvent(new CustomEvent("bridge:circuit-trip", { detail: payload.data ?? payload }))
            break

          // connection:status and decision:made intentionally ignored — no admin action needed
        }
      } catch {
        // Heartbeats or non-JSON — ignore
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects — nothing to do
    }

    // Admin's own SSE channel — gateway config changes, restarts, updates
    const adminEs = new EventSource("/api/admin/events")
    adminEs.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        switch (payload.type) {
          case "bridge:config-changed":
          case "bridge:restarted":
          case "bridge:updated":
            qc.invalidateQueries({ queryKey: ["bridge"] })
            qc.invalidateQueries({ queryKey: ["admin", "intelligence"] })
            break
        }
      } catch { /* heartbeat */ }
    }

    return () => { es.close(); adminEs.close() }
  }, [qc])
}
