import { useNavigate, useLocation } from "react-router"
import { Search, Bell, Moon, Sun, ArrowLeft } from "lucide-react"

interface TopBarProps {
  onToggleTheme: () => void
  theme: "dark" | "light"
}

const backRoutes: Record<string, { label: string; path: string }> = {
  "/users/": { label: "Customers", path: "/users" },
}

export function TopBar({ onToggleTheme, theme }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  // Find matching back route (prefix match)
  let back: { label: string; path: string } | null = null
  for (const [prefix, route] of Object.entries(backRoutes)) {
    if (location.pathname.startsWith(prefix) && location.pathname !== prefix.replace(/\/$/, "")) {
      back = route
      break
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-3 h-[var(--header-height)]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text3" />
        <input
          placeholder="Search..."
          className="h-7 w-[240px] rounded-lg border border-border bg-raised pl-8 pr-3 text-xs text-foreground placeholder:text-text3 focus:border-accent-porter focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5">
        {back && (
          <button
            onClick={() => navigate(back!.path)}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-text3 transition-colors hover:bg-raised hover:text-text2 mr-1"
          >
            <ArrowLeft className="h-3 w-3" />
            {back.label}
          </button>
        )}
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
