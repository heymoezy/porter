import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"

interface SystemData {
  memory: { total: number; used: number; free: number; pct: number }
  cpu: { cores: number; model: string; load1m: number; load5m: number; load15m: number }
  disk: { total: number; used: number; available: number; pct: number }
  uptime: number
  sessions: { active: number; concurrent: number }
  runtimes: Array<{ name: string; url: string; status: string; latencyMs: number }>
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function getVerdict(sys: SystemData): { label: string; color: string; dot: string } {
  const runtimesHealthy = sys.runtimes.every((r) => r.status === "healthy")
  const memOk = sys.memory.pct < 95
  const diskOk = sys.disk.pct < 95
  if (runtimesHealthy && memOk && diskOk)
    return { label: "All Systems Operational", color: "text-green-400", dot: "bg-green-400" }
  return { label: "Degraded", color: "text-yellow-400", dot: "bg-yellow-400" }
}

function InlineBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-yellow-400" : "bg-green-400/70"
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-mono text-[var(--text3,#8a95a8)]">
      <span className="font-semibold text-[var(--foreground,#f6f8fb)]">{label}</span>
      <span className="text-[var(--foreground,#f6f8fb)]">{pct}%</span>
      <span className="inline-block w-14 h-1.5 rounded-full bg-[var(--raised,#2b3444)] overflow-hidden">
        <span className={`block h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

export function VerdictBar() {
  const { data: sys } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<SystemData>("/api/admin/system"),
    refetchInterval: 30_000,
  })

  if (!sys) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border,#3d4758)] bg-[var(--surface,#222a38)] px-4 py-2">
        <span className="size-2 rounded-full bg-[var(--text3,#8a95a8)] animate-pulse" />
        <span className="text-2xs text-[var(--text3,#8a95a8)] font-mono">Connecting...</span>
      </div>
    )
  }

  const cpuPct = Math.round((sys.cpu.load1m / sys.cpu.cores) * 100)
  const verdict = getVerdict(sys)

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--border,#3d4758)] bg-[var(--surface,#222a38)] px-4 py-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold">
        <span className={`size-2 rounded-full ${verdict.dot} animate-pulse`} />
        <span className={verdict.color}>{verdict.label}</span>
      </span>
      <span className="h-3 w-px bg-[var(--border,#3d4758)]" />
      <InlineBar pct={cpuPct} label="CPU" />
      <InlineBar pct={sys.memory.pct} label="MEM" />
      <InlineBar pct={sys.disk.pct} label="DSK" />
      <span className="h-3 w-px bg-[var(--border,#3d4758)]" />
      <span className="text-2xs font-mono text-[var(--text3,#8a95a8)]">
        up <span className="text-[var(--foreground,#f6f8fb)]">{formatUptime(sys.uptime)}</span>
      </span>
      <span className="text-2xs font-mono text-[var(--text3,#8a95a8)]">
        <span className="text-[var(--foreground,#f6f8fb)]">{sys.sessions.active}</span> sessions
      </span>
    </div>
  )
}
