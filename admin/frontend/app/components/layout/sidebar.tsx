import { Link, useLocation } from "react-router"
import { PorterLogo } from "~/components/porter-logo"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import {
  Users, Mail, CreditCard, LayoutDashboard, Bot, Bug,
  ChevronLeft, ChevronRight, Settings, LogOut,
  Blocks, Server, Shield, Wrench, Sparkles, Monitor, Activity,
} from "lucide-react"
import { useLogout } from "~/hooks/use-api"
import { useCurrentUser } from "~/lib/session-context"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const groups = [
  { label: "Platform", items: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: CreditCard, label: "Revenue", path: "/billing" },
    { icon: Users, label: "Customers", path: "/users" },
    { icon: Shield, label: "Porter", path: "/porter" },
    { icon: Blocks, label: "Agent Templates", path: "/templates" },
    { icon: Bot, label: "User Agents", path: "/agents" },
    { icon: Sparkles, label: "Skills", path: "/skills" },
    { icon: Server, label: "Models", path: "/models" },
    { icon: Wrench, label: "Tools", path: "/tools" },
  ]},
  { label: "Ops", items: [
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: Bug, label: "Diagnostics", path: "/diagnostics" },
    { icon: Monitor, label: "System", path: "/system" },
    { icon: Mail, label: "Email", path: "/email" },
  ]},
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const user = useCurrentUser()
  const logout = useLogout()

  return (
    <aside className={`flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-[var(--duration-normal)] ${collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"}`}>
      {/* Header */}
      <div className={`flex items-center border-b border-border px-3 h-[var(--header-height)] ${collapsed ? "justify-center" : "justify-between"}`}>
        <PorterLogo size="sm" showText={!collapsed} label={collapsed ? undefined : "Admin"} />
        <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {groups.map(g => (
          <div key={g.label}>
            {collapsed
              ? <Separator className="my-2 bg-border" />
              : <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text3">{g.label}</p>
            }
            {g.items.map(item => {
              const active = item.path === "/"
                ? location.pathname === "/"
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
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <PixelPortrait hair="#2C1B18" skin="#E0AC69" eyes="#1A1A2E" shirt="#64748B" hairStyle="short" size="sm" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{user.displayName || user.username}</p>
                <p className="text-[10px] text-text3">{user.role}</p>
              </div>
              <button className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2">
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => logout.mutate()} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {!collapsed && (
          <Link to="/changelog" className="mt-2 block text-center text-[10px] uppercase tracking-widest text-text3 hover:text-accent-porter transition-colors">
            Porter Admin v0.2.12
          </Link>
        )}
      </div>
    </aside>
  )
}
