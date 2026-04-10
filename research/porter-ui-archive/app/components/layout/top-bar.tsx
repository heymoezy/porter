import { useLocation, useNavigate } from "react-router"
import {
  Bell, Moon, Sun, ArrowLeft,
  LayoutDashboard, FolderKanban, Bot, FileText, Users,
  Box, Monitor, Link as LinkIcon, Brain, Heart, Shield,
  ScrollText, Scale, Lock, Settings,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface TopBarProps {
  onToggleTheme: () => void
  theme: "dark" | "light"
  notificationCount?: number
}

const pageTitles: Array<{ path: string; exact?: boolean; label: string; icon: LucideIcon; back?: boolean }> = [
  { path: "/", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/projects", label: "Projects", icon: FolderKanban },
  { path: "/agents", label: "AI Agents", icon: Bot },
  { path: "/files", label: "Files", icon: FileText },
  { path: "/people", label: "People", icon: Users },
  { path: "/models", label: "Models", icon: Box },
  { path: "/tools", label: "Tools", icon: Monitor },
  { path: "/connections", label: "Connections", icon: LinkIcon },
  { path: "/memory", label: "Memory", icon: Brain },
  { path: "/health", label: "Health", icon: Heart },
  { path: "/logs", label: "Logs", icon: Shield },
  { path: "/changelog", label: "Changelog", icon: ScrollText, back: true },
  { path: "/terms", label: "Terms of Service", icon: Scale },
  { path: "/privacy", label: "Privacy Policy", icon: Lock },
  { path: "/verify-email", label: "Verify Email", icon: Shield },
  { path: "/reset-password", label: "Reset Password", icon: Lock },
  { path: "/settings", label: "Settings", icon: Settings, back: true },
]

export function TopBar({ onToggleTheme, theme, notificationCount = 0 }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const page = pageTitles.find(p =>
    p.exact ? location.pathname === p.path : location.pathname.startsWith(p.path)
  )

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-3 h-[var(--header-height)]">
      <div className="flex items-center gap-1">
        {page?.back && (
          <button onClick={() => navigate(-1)}
            className="flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {page && (
          <div className="flex items-center gap-2 px-2">
            <page.icon className="h-3.5 w-3.5 text-accent-porter" />
            <span className="text-sm font-semibold text-foreground">{page.label}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button className="relative flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2">
          <Bell className="h-3.5 w-3.5" />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-danger px-0.5 text-[8px] font-bold text-white animate-pulse-badge">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>
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
