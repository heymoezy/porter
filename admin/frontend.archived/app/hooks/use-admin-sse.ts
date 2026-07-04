import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

// Minimal inline type for dispatch log cache — avoids cross-module import
type DispatchLogCache = { entries: unknown[]; pagination: { total: number; [k: string]: unknown } }

/**
 * Connects to Brain's SSE stream and invalidates React Query caches
 * when relevant events arrive. Fire-and-forget — reconnects automatically.
 *
 * Refactor note (Phase 48.4-03): backend's sse-hub.ts writes `event: <topic>\ndata: <json>`
 * (named SSE events). EventSource.onmessage ONLY fires for UNNAMED events, so every prior
 * switch case here NEVER fired against the live backend. This refactor switches to
 * addEventListener(topic, handler) per topic, fixing that dormant repo-wide bug AND
 * registering the 3 new dreams topics (proposals:created, proposals:resolved, dreams:run-completed).
 */
export function useAdminSSE() {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource("/api/events")
    const adminEs = new EventSource("/api/admin/events")

    // Helper: build a listener that parses event.data once.
    const parsed = (
      handler: (payload: { data?: Record<string, unknown>; [k: string]: unknown }) => void,
    ): EventListener => {
      return (ev: Event) => {
        const msg = ev as MessageEvent<string>
        try {
          const payload = JSON.parse(msg.data)
          handler(payload)
        } catch {
          // Heartbeats or non-JSON — ignore
        }
      }
    }

    // ─── /api/events channel ────────────────────────────────────────────────
    // Each topic gets its own explicit addEventListener call (named SSE events
    // only fire on addEventListener, NOT on .onmessage — see module header).

    es.addEventListener("profile:updated", parsed((payload) => {
      const data = payload.data as { username?: string } | undefined
      const username = data?.username ?? (payload as { username?: string }).username
      if (username) qc.invalidateQueries({ queryKey: ["admin", "customers", username] })
      qc.invalidateQueries({ queryKey: ["admin", "customers"] })
    }))

    es.addEventListener("agent:activity", parsed(() => qc.invalidateQueries({ queryKey: ["admin", "customers"] })))
    es.addEventListener("agent:status",   parsed(() => qc.invalidateQueries({ queryKey: ["admin", "customers"] })))

    es.addEventListener("bridge:health", parsed(() => {
      qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
      qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
    }))

    es.addEventListener("bridge:usage", parsed(() => qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })))

    es.addEventListener("bridge:activity", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
      window.dispatchEvent(new CustomEvent("bridge:activity", { detail: payload.data ?? payload }))
    }))

    es.addEventListener("bridge:dispatch", parsed((payload) => {
      const data = payload.data as { entry?: unknown } | undefined
      const entry = data?.entry ?? (payload as { entry?: unknown }).entry
      if (entry) {
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
      }
      qc.invalidateQueries({ queryKey: ["bridge", "dispatch-log-summary"] })
      qc.invalidateQueries({ queryKey: ["bridge", "costs-summary"] })
      qc.invalidateQueries({ queryKey: ["bridge", "intel-recent"] })
      qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
    }))

    es.addEventListener("bridge:circuit-trip", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
      window.dispatchEvent(new CustomEvent("bridge:circuit-trip", { detail: payload.data ?? payload }))
    }))

    es.addEventListener("bridge:context-pressure", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["bridge", "sessions"] })
      window.dispatchEvent(new CustomEvent("bridge:context-pressure", { detail: payload.data ?? payload }))
    }))

    es.addEventListener("bridge:intelligence", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["bridge", "patterns"] })
      window.dispatchEvent(new CustomEvent("bridge:intelligence", { detail: payload.data ?? payload }))
    }))

    es.addEventListener("bridge:msg-bus", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["bridge", "msgbus"] })
      window.dispatchEvent(new CustomEvent("bridge:msg-bus", { detail: payload.data ?? payload }))
    }))

    // connection:status and decision:made intentionally ignored — no admin action needed

    // ─── Phase 48.4 — Dreams topics ─────────────────────────────────────────
    const onProposalsChange = () => {
      qc.invalidateQueries({ queryKey: ["admin", "dreams", "proposals"] })
      qc.invalidateQueries({ queryKey: ["admin", "dreams", "runs"] })
    }
    es.addEventListener("proposals:created",  parsed(onProposalsChange))
    es.addEventListener("proposals:resolved", parsed(onProposalsChange))
    es.addEventListener("dreams:run-completed", parsed((payload) => {
      qc.invalidateQueries({ queryKey: ["admin", "dreams"] })
      window.dispatchEvent(new CustomEvent("dreams:run-completed", { detail: payload.data ?? payload }))
    }))

    // ─── /api/admin/events channel ──────────────────────────────────────────
    const onBridgeConfigChange = parsed(() => {
      qc.invalidateQueries({ queryKey: ["bridge"] })
      qc.invalidateQueries({ queryKey: ["admin", "intelligence"] })
    })
    adminEs.addEventListener("bridge:config-changed", onBridgeConfigChange)
    adminEs.addEventListener("bridge:restarted",      onBridgeConfigChange)
    adminEs.addEventListener("bridge:updated",        onBridgeConfigChange)

    es.onerror = () => {
      // EventSource auto-reconnects — nothing to do
    }
    adminEs.onerror = () => {
      // EventSource auto-reconnects — nothing to do
    }

    return () => { es.close(); adminEs.close() }
  }, [qc])
}
