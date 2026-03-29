import { useState, useEffect, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Sidebar } from "~/components/layout/sidebar"
import { TopBar, type AdminNotification } from "~/components/layout/top-bar"
import { AuthGuard } from "~/components/auth-guard"
import { SessionProvider } from "~/lib/session-context"
import { ErrorBoundary } from "~/components/error-boundary"
import { useSession } from "~/hooks/use-api"
import { useAdminSSE } from "~/hooks/use-admin-sse"

interface AdminShellProps {
  children: ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  return (
    <AuthGuard>
      <AdminShellInner>{children}</AdminShellInner>
    </AuthGuard>
  )
}

function getInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark"
  const saved = localStorage.getItem("porter_theme")
  return saved === "light" ? "light" : "dark"
}

function AdminShellInner({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  useAdminSSE()
  const [collapsed, setCollapsed] = useState(false)

  // Bridge update badge — count gateways with pending updates or missing installs
  const { data: versionData } = useQuery({
    queryKey: ["bridge", "versions"],
    queryFn: () => api<{ versions: Array<{ is_latest: boolean | null; version: string | null; update_cmd: string | null }> }>("/api/admin/bridge/versions"),
    staleTime: 120_000,
    enabled: !!session,
  })
  const bridgeUpdateCount = (versionData?.versions ?? []).filter(
    v => v.is_latest === false || (!v.version && v.update_cmd)
  ).length
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])

  // Sync DOM class on mount and theme change
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light")
  }, [theme])

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem("porter_theme", next)
  }

  function dismissNotification(id: number) {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <ErrorBoundary module="Sidebar">
          <Sidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            notificationCount={notifications.length}
            bridgeUpdateCount={bridgeUpdateCount}
          />
        </ErrorBoundary>
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <ErrorBoundary module="TopBar">
            <TopBar
              onToggleTheme={toggleTheme}
              theme={theme}
              notifications={notifications}
              onDismissNotification={dismissNotification}
            />
          </ErrorBoundary>
          <ErrorBoundary module="Content">
            <div className="flex-1 overflow-hidden flex flex-col">
              {children}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </SessionProvider>
  )
}
