import { useNavigate, useLocation } from "react-router"
import { Bell, Moon, Sun, ArrowLeft } from "lucide-react"

interface TopBarProps {
  onToggleTheme: () => void
  theme: "dark" | "light"
}

const backRoutes: Record<string, { label: string; path: string }> = {
  "/users/": { label: "Customers", path: "/users" },
  "/agents/": { label: "Agents", path: "/agents" },
}

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

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-3 h-[var(--header-height)]">
      <div>
        {back && (
          <button
            onClick={() => navigate(back!.path)}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-text3 transition-colors hover:bg-raised hover:text-text2"
          >
            <ArrowLeft className="h-3 w-3" />
            {back.label}
          </button>
        )}
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
