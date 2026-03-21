import { useState, useEffect, type ReactNode } from "react"
import { Sidebar } from "~/components/layout/sidebar"
import { TopBar } from "~/components/layout/top-bar"
import { AuthGuard } from "~/components/auth-guard"
import { SessionProvider } from "~/lib/session-context"
import { ErrorBoundary } from "~/components/error-boundary"
import { useSession } from "~/hooks/use-api"

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
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme)

  // Sync DOM class on mount and theme change
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light")
  }, [theme])

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem("porter_theme", next)
  }

  return (
    <SessionProvider session={session!}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <ErrorBoundary module="Sidebar">
          <Sidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
          />
        </ErrorBoundary>
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <ErrorBoundary module="TopBar">
            <TopBar onToggleTheme={toggleTheme} theme={theme} />
          </ErrorBoundary>
          <ErrorBoundary module="Content">
            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </SessionProvider>
  )
}
