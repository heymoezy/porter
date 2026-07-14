import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router"
import {
  Bell, ArrowLeft, X,
  LayoutDashboard,
  Sparkles, Wrench, Activity, Bug, Monitor, FileText, Settings, Route, Plug,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ContextSwitcher } from "./context-switcher"

export interface AdminNotification {
  id: number
  text: string
  color: "danger" | "warning" | "success"
  time: string
}

interface TopBarProps {
  notifications: AdminNotification[]
  onDismissNotification: (id: number) => void
}

/** Detail routes that show a back button instead of a page title */
const detailPrefixes = ["/agents/"]

const pageTitles: Array<{ path: string; exact?: boolean; label: string; icon: LucideIcon }> = [
  { path: "/", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { path: "/dashboard", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { path: "/skills", label: "Skills", icon: Sparkles },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/mcp", label: "MCP Servers", icon: Plug },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/bridge", label: "Bridge", icon: Route },
  { path: "/diagnostics", label: "Diagnostics", icon: Bug },
  { path: "/system", label: "System", icon: Monitor },
  { path: "/changelog", label: "Changelog", icon: FileText },
  { path: "/settings", label: "Settings", icon: Settings },
  // "Brain" is now "Memory", under Porter. The route stays /brain so nothing breaks.
  { path: "/brain", label: "Memory", icon: LayoutDashboard },
  { path: "/intelligence", label: "Intelligence", icon: LayoutDashboard },
  { path: "/architecture", label: "Architecture", icon: LayoutDashboard },
  { path: "/design-system", label: "Design System", icon: LayoutDashboard },
  { path: "/files", label: "Files", icon: FileText },
]

function lookupPageLabel(pathname: string): string {
  const match = pageTitles.find(p => p.exact ? pathname === p.path : pathname.startsWith(p.path))
  return match?.label || "Back"
}

const colorDot: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
}

export function TopBar({ notifications, onDismissNotification }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
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

  // Is this a detail page that needs a back button?
  const isDetail = detailPrefixes.some(prefix =>
    location.pathname.startsWith(prefix) && location.pathname !== prefix.replace(/\/$/, "")
  )

  // Read the stored path from the PREVIOUS page. On detail pages, the effect
  // below hasn't fired yet, so porter-nav-from still holds the last non-detail path.
  const backLabel = isDetail ? lookupPageLabel(sessionStorage.getItem("porter-nav-from") || "/") : null

  // Store the current path as "nav-from" only when NOT on a detail page.
  // This way, navigating between agents doesn't overwrite the origin.
  useEffect(() => {
    if (!isDetail) {
      sessionStorage.setItem("porter-nav-from", location.pathname)
    }
  }, [location.pathname, isDetail])

  const page = !isDetail
    ? pageTitles.find(p => p.exact ? location.pathname === p.path : location.pathname.startsWith(p.path))
    : null

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-3 h-[var(--header-height)]">
      <div>
        {isDetail ? (
          <button
            onClick={() => navigate(-1)}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-text3 transition-colors hover:bg-raised hover:text-text2"
          >
            <ArrowLeft className="h-3 w-3" />
            {backLabel}
          </button>
        ) : page ? (
          <div className="flex items-center gap-2 px-2">
            <page.icon className="h-3.5 w-3.5 text-accent-porter" />
            <span className="text-sm font-semibold text-foreground">{page.label}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {/* #27 R1: global product/tenant context. Additive — nothing removed.
            Porter is multi-app; this is the first surface that admits it. The
            selection pins the SAME active-project the CLI sessions read, so the
            admin and every Claude/codex/grok session agree on what we're on. */}
        <ContextSwitcher />

        {/* Bell + dropdown */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen(!open)}
            className="relative flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2"
          >
            <Bell className="h-3.5 w-3.5" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-danger px-0.5 text-2xs font-bold text-white animate-pulse-badge">
                {notifications.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-surface shadow-[var(--shadow-dropdown)] animate-dropdown-open z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Notifications</span>
                <span className="text-2xs text-text3">{notifications.length} unread</span>
              </div>
              {notifications.length === 0 ? (
                <div className="px-3 py-4 text-center text-2xs text-text3">All clear</div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
                  {notifications.map(n => (
                    <div key={n.id} className="flex items-start gap-2 px-3 py-2 hover:bg-raised/50 transition-colors group">
                      <div className={`h-2 w-2 rounded-full shrink-0 mt-1 ${colorDot[n.color]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-2xs text-foreground leading-tight">{n.text}</p>
                        <p className="text-2xs text-text3 mt-0.5">{n.time}</p>
                      </div>
                      <button
                        onClick={() => onDismissNotification(n.id)}
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

      </div>
    </div>
  )
}
