import { AppShell } from "~/components/layout/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { useConnections } from "~/hooks/use-api"
import { Loader2, Plus, Plug, Unplug } from "lucide-react"

interface Connection {
  id: string
  provider: string
  kind: string
  status: "connected" | "disconnected" | "error"
  config?: Record<string, unknown>
  last_sync?: string | null
  created_at?: string
}

const STATUS_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  connected: { dot: "bg-success", badge: "bg-success/15 text-success", label: "Connected" },
  disconnected: { dot: "bg-text3", badge: "bg-text3/15 text-text3", label: "Disconnected" },
  error: { dot: "bg-danger", badge: "bg-danger/15 text-danger", label: "Error" },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never"
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function ConnectionCard({ connection }: { connection: Connection }) {
  const st = STATUS_STYLE[connection.status] ?? STATUS_STYLE.disconnected

  return (
    <Card size="sm" className="bg-surface border-border">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {connection.status === "connected" ? (
              <Plug className="size-4 text-success" />
            ) : (
              <Unplug className="size-4 text-text3" />
            )}
            <CardTitle className="text-sm font-bold text-foreground">{connection.provider}</CardTitle>
          </div>
          <Badge className={`text-[9px] px-1.5 py-0 ${st.badge}`}>
            {st.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-text2">{connection.kind}</p>
          <p className="text-[10px] text-text3">Synced: {formatDate(connection.last_sync)}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Unplug className="size-8 text-text3 mb-3" />
      <p className="text-sm font-medium text-text2">No connections configured</p>
      <p className="text-xs text-text3 mt-1">Connect external services to extend Porter</p>
    </div>
  )
}

export default function ConnectionsPage() {
  const { data, isLoading, error } = useConnections()

  const connections: Connection[] = data?.connections ?? []

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[900px] space-y-6">
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              className="bg-accent-porter text-white hover:bg-accent-hover text-xs font-bold gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Connection
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-text3">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Loading connections...</span>
            </div>
          )}

          {error && (
            <div className="py-12 text-center">
              <p className="text-xs text-danger">Failed to load connections</p>
            </div>
          )}

          {data && connections.length === 0 && <EmptyState />}

          {connections.length > 0 && (
            <div className="animated-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
