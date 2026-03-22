import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router"
import {
  Bell, Moon, Sun, ArrowLeft, X,
  LayoutDashboard, CreditCard, Users, Shield, Blocks, Bot,
  Sparkles, Server, Wrench, Activity, Bug, Monitor, Mail, FileText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface TopBarProps {
  onToggleTheme: () => void
  theme: "dark" | "light"
}

const backRoutes: Record<string, { label: string; path: string }> = {
  "/users/": { label: "Customers", path: "/users" },
  "/agents/": { label: "User Agents", path: "/agents" },
  "/templates/": { label: "Agent Templates", path: "/templates" },
}

const pageTitles: Array<{ path: string; exact?: boolean; label: string; icon: LucideIcon }> = [
  { path: "/", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { path: "/dashboard", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { path: "/billing", label: "Revenue", icon: CreditCard },
  { path: "/users", label: "Customers", icon: Users },
  { path: "/porter", label: "Porter", icon: Shield },
  { path: "/templates", label: "Agent Templates", icon: Blocks },
  { path: "/agents", label: "User Agents", icon: Bot },
  { path: "/skills", label: "Skills", icon: Sparkles },
  { path: "/models", label: "Models", icon: Server },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/diagnostics", label: "Diagnostics", icon: Bug },
  { path: "/system", label: "System", icon: Monitor },
  { path: "/email", label: "Email", icon: Mail },
  { path: "/changelog", label: "Changelog", icon: FileText },
]

interface Notification {
  id: number
  text: string
  color: "danger" | "warning" | "success"
  time: string
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 1, text: "CPU usage exceeded 80% threshold", color: "warning", time: "2m ago" },
  { id: 2, text: "New user signup: john@acme.com", color: "success", time: "5m ago" },
  { id: 3, text: "Agent 'SEO Specialist' failed task", color: "danger", time: "12m ago" },
]

const colorDot: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
}

export function TopBar({ onToggleTheme, theme }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function dismiss(id: number) {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  let back: { label: string; path: string } | null = null
  for (const [prefix, route] of Object.entries(backRoutes)) {
    if (location.pathname.startsWith(prefix) && location.pathname !== prefix.replace(/\/$/, "")) {
      back = route
      break
    }
  }

  const page = !back
    ? pageTitles.find(p => p.exact ? location.pathname === p.path : location.pathname.startsWith(p.path))
    : null

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-3 h-[var(--header-height)]">
      <div>
        {back ? (
          <button
            onClick={() => navigate(back!.path)}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-text3 transition-colors hover:bg-raised hover:text-text2"
          >
            <ArrowLeft className="h-3 w-3" />
            {back.label}
          </button>
        ) : page ? (
          <div className="flex items-center gap-2 px-2">
            <page.icon className="h-3.5 w-3.5 text-accent-porter" />
            <span className="text-sm font-semibold text-foreground">{page.label}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {/* Bell + dropdown */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen(!open)}
            className="relative flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2"
          >
            <Bell className="h-3.5 w-3.5" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-danger px-0.5 text-[8px] font-bold text-white animate-pulse-badge">
                {notifications.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-surface shadow-[var(--shadow-dropdown)] animate-dropdown-open z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Notifications</span>
                <span className="text-[10px] text-text3">{notifications.length} unread</span>
              </div>
              {notifications.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-text3">All clear</div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
                  {notifications.map(n => (
                    <div key={n.id} className="flex items-start gap-2 px-3 py-2 hover:bg-raised/50 transition-colors group">
                      <div className={`h-2 w-2 rounded-full shrink-0 mt-1 ${colorDot[n.color]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-foreground leading-tight">{n.text}</p>
                        <p className="text-[9px] text-text3 mt-0.5">{n.time}</p>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="flex h-4 w-4 items-center justify-center rounded text-text3 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-foreground transition-opacity shrink-0"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onToggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2"
        >
          {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
