import { useNavigate, useLocation } from "react-router"
import {
  Bell, Moon, Sun, ArrowLeft,
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

export function TopBar({ onToggleTheme, theme }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()

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
        <button className="relative flex h-7 w-7 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2">
          <Bell className="h-3.5 w-3.5" />
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
