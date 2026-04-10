import { Link, useLocation } from "react-router"
import { VERSION } from "~/lib/constants"
import { PorterLogo } from "~/components/porter-logo"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Separator } from "~/components/ui/separator"
import { useLogout } from "~/hooks/use-api"
import { useCurrentUser } from "~/lib/session-context"
import {
  FolderKanban, Bot, FileText, Users, Route, Monitor,
  Link as LinkIcon, Brain, Shield, Heart, LayoutDashboard,
  ChevronLeft, ChevronRight, Settings, LogOut,
} from "lucide-react"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  user?: { name: string; skin: string; hair: string; eyes: string; shirt: string; hairStyle: string }
  notificationCount?: number
}

const groups = [
  { label: "Work", items: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", badge: 0 },
    { icon: FolderKanban, label: "Projects", path: "/projects", badge: 0 },
    { icon: Bot, label: "AI Agents", path: "/agents", badge: 0 },
    { icon: FileText, label: "Files", path: "/files", badge: 0 },
    { icon: Users, label: "People", path: "/people", badge: 0 },
  ]},
  { label: "System", items: [
    { icon: Route, label: "Bridge", path: "/bridge", badge: 0 },
    { icon: Monitor, label: "Tools", path: "/tools", badge: 0 },
    { icon: LinkIcon, label: "Connections", path: "/connections", badge: 0 },
  ]},
  { label: "Inspect", items: [
    { icon: Brain, label: "Memory", path: "/memory", badge: 0 },
    { icon: Heart, label: "Health", path: "/health", badge: 0 },
    { icon: Shield, label: "Logs", path: "/logs", badge: 0 },
  ]},
]

const DEFAULT_APPEARANCE = { skin: "#E0AC69", hair: "#2C1B18", eyes: "#1A1A2E", shirt: "#64748B", hairStyle: "short" }

export function Sidebar({ collapsed, onToggle, user, notificationCount = 0 }: SidebarProps) {
  const location = useLocation()
  const logout = useLogout()

  // Read avatar from session context (persisted in avatar_url as JSON)
  let sessionUser: { displayName: string; avatarUrl?: string | null } | null = null
  try { sessionUser = useCurrentUser() as any } catch {}

  const appearance = (() => {
    try {
      const raw = (sessionUser as any)?.avatarUrl
      if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
    } catch {}
    return user ? { skin: user.skin, hair: user.hair, eyes: user.eyes, shirt: user.shirt, hairStyle: user.hairStyle } : DEFAULT_APPEARANCE
  })()

  const u = {
    name: sessionUser?.displayName || user?.name || "User",
    ...appearance,
  }

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
        {groups.map(g => (
          <div key={g.label}>
            {collapsed
              ? <Separator className="my-2 bg-border" />
              : <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text3">{g.label}</p>
            }
            {g.items.map(item => {
              const active = item.path === "/dashboard"
                ? location.pathname === "/" || location.pathname === "/dashboard"
                : location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-[var(--duration-instant)] ${
                    active
                      ? "bg-accent-porter/10 font-medium text-accent-porter"
                      : "text-text2 hover:bg-raised"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!collapsed && (() => {
                    const count = item.path === "/dashboard" ? notificationCount : item.badge
                    return count > 0 ? (
                      <Badge className="bg-danger text-white text-[10px] px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
                        {count}
                      </Badge>
                    ) : null
                  })()}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5">
          <PixelPortrait skin={u.skin} hair={u.hair} eyes={u.eyes} shirt={u.shirt} hairStyle={u.hairStyle as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"} size="sm" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{u.name}</p>
              </div>
              <Link to="/settings" className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2">
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <button onClick={() => logout.mutate()} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {!collapsed && (
          <Link to="/changelog" className="mt-2.5 block text-center text-[10px] uppercase tracking-widest text-text3 hover:text-accent-porter transition-colors">
            Porter v{VERSION}
          </Link>
        )}
      </div>
    </aside>
  )
}
