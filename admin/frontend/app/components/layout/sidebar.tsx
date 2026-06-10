import { useQuery } from "@tanstack/react-query"
import { Link, useLocation } from "react-router"
import { VERSION } from "~/lib/constants"
import { PorterLogo } from "~/components/porter-logo"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import {
  Mail, LayoutDashboard,
  ChevronLeft, ChevronRight, Settings, LogOut,
  FolderOpen, Route,
  Code2, Palette, Flame,
  Wrench, MessageCircle, Brain,
} from "lucide-react"
import { useLogout } from "~/hooks/use-api"
import { useCurrentUser } from "~/lib/session-context"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  notificationCount?: number
  bridgeUpdateCount?: number
}

// Live backend version for the sidebar chip — the baked frontend package
// version drifts (showed 6.3.0 while the backend ran 6.30.x).
function useLiveVersion(): string | undefined {
  const { data } = useQuery({
    queryKey: ["health", "version"],
    queryFn: async () => {
      const res = await fetch("/health")
      return (await res.json()) as { version?: string }
    },
    staleTime: 300_000,
  })
  return data?.version
}

const groups = [
  { label: "", items: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  ]},
  { label: "Projects", items: [
    { icon: FolderOpen, label: "Projects", path: "/files" },
  ]},
  { label: "Agents", items: [
    { icon: Flame, label: "Forge", path: "/forge" },
    { icon: Mail, label: "Email", path: "/email" },
    { icon: MessageCircle, label: "Skill Feedback", path: "/skill-feedback" },
  ]},
  { label: "Ops", items: [
    { icon: Route, label: "Bridge", path: "/bridge" },
    { icon: Brain, label: "Brain", path: "/brain" },
    { icon: Wrench, label: "Env Tools", path: "/env-tools" },
  ]},
  { label: "Dev", items: [
    { icon: Palette, label: "Design System", path: "/design-system" },
    { icon: Code2, label: "Architecture", path: "/architecture" },
  ]},
]

export function Sidebar({ collapsed, onToggle, notificationCount = 0, bridgeUpdateCount = 0 }: SidebarProps) {
  const liveVersion = useLiveVersion()
  const location = useLocation()
  const user = useCurrentUser()
  const logout = useLogout()

  return (
    <aside className={`flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-[var(--duration-normal)] ${collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"}`}>
      {/* Header */}
      <div className={`flex items-center border-b border-border px-3 h-[var(--header-height)] ${collapsed ? "justify-center" : "justify-between"}`}>
        <PorterLogo size="sm" showText={!collapsed} />
        <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
        {groups.map((g, gi) => (
          <div key={g.label || `group-${gi}`}>
            {g.label ? (
              collapsed
                ? <Separator className="my-2 bg-border" />
                : <p className="px-2.5 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text3">{g.label}</p>
            ) : null}
            {g.items.map(item => {
              const active = item.path === "/dashboard"
                ? location.pathname === "/" || location.pathname === "/dashboard"
                : location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  state={item.path === "/files" ? { reset: Date.now() } : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors duration-[var(--duration-instant)] ${
                    active
                      ? "bg-accent-porter/10 font-medium text-accent-porter"
                      : "text-text2 hover:bg-raised"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!collapsed && item.path === "/dashboard" && notificationCount > 0 && (
                    <Badge className="bg-danger text-white text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
                      {notificationCount}
                    </Badge>
                  )}
                  {!collapsed && item.path === "/bridge" && bridgeUpdateCount > 0 && (
                    <Badge className="bg-warning text-white text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
                      {bridgeUpdateCount}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <PixelPortrait {...(() => {
            const d = { hair: "#2C1B18", skin: "#E0AC69", eyes: "#1A1A2E", shirt: "#64748B", hairStyle: "short" as const }
            try { if ((user as any)?.avatarUrl) return { ...d, ...JSON.parse((user as any).avatarUrl) } } catch {}
            return d
          })()} size="sm" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{user.displayName || user.username}</p>
                <p className="text-2xs text-text3">{(user.role ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
              </div>
              <Link to="/settings" className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised">
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <button onClick={() => logout.mutate()} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {!collapsed && (
          <Link to="/changelog" className="mt-2 block text-center uppercase tracking-widest text-text3 hover:text-accent-porter transition-colors" style={{ fontSize: '10px' }}>
            Porter v{liveVersion ?? VERSION}
          </Link>
        )}
      </div>
    </aside>
  )
}
