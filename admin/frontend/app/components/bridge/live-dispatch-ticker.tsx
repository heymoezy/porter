import { useEffect, useState } from "react"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Activity } from "lucide-react"

interface TickerEvent {
  ts: number
  kind: "dispatch" | "cli"
  label: string
  detail: string
}

const MAX = 12

export function LiveDispatchTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([])
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const es = new EventSource("/api/events")

    es.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data)
        const kind = (p.type ?? p.event) as string
        const data = p.data ?? p

        if (kind === "bridge:dispatch") {
          const ev: TickerEvent = {
            ts: Date.now(),
            kind: "dispatch",
            label: data.model_name ?? data.model ?? "model",
            detail: `${data.reason ?? "—"}${data.latency_ms ? ` · ${data.latency_ms}ms` : ""}`,
          }
          setEvents(prev => [ev, ...prev].slice(0, MAX))
          setPulse(true)
          setTimeout(() => setPulse(false), 600)
        } else if (kind === "cli:activity") {
          const ev: TickerEvent = {
            ts: Date.now(),
            kind: "cli",
            label: data.tool ?? data.intent ?? "tool",
            detail: data.gateway_type ?? "claude_cli",
          }
          setEvents(prev => [ev, ...prev].slice(0, MAX))
        }
      } catch { /* ignore */ }
    }

    return () => es.close()
  }, [])

  const empty = events.length === 0

  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <Activity className={`size-3.5 ${pulse ? "text-success animate-pulse" : "text-text3"}`} />
          <span className="text-2xs uppercase tracking-wider text-text3">Live</span>
          <span className="ml-auto text-2xs text-text3">{events.length} event{events.length === 1 ? "" : "s"}</span>
        </div>
        {empty ? (
          <div className="py-4 text-center text-xs text-text3">Waiting for activity…</div>
        ) : (
          <div className="space-y-1">
            {events.map((ev, i) => (
              <div
                key={ev.ts + "-" + i}
                className={`flex items-center gap-2 text-xs ${i === 0 ? "animate-in fade-in slide-in-from-top-1 duration-300" : ""}`}
              >
                <Badge variant={ev.kind === "dispatch" ? "default" : "outline"} className="text-2xs font-mono">
                  {ev.kind === "dispatch" ? "→" : "↳"} {ev.label}
                </Badge>
                <span className="text-text3 truncate">{ev.detail}</span>
                <span className="ml-auto text-2xs font-mono text-text3 shrink-0">
                  {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
