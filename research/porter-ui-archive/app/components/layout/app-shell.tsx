import { useState, useEffect, type ReactNode } from "react"
import { Sidebar } from "~/components/layout/sidebar"
import { TopBar } from "~/components/layout/top-bar"
import { AuthGuard } from "~/components/auth-guard"
import { SessionProvider } from "~/lib/session-context"
import { ErrorBoundary } from "~/components/error-boundary"
import { useSession } from "~/hooks/use-api"
import { PixelPortrait } from "~/components/pixel-portrait"
import { ChatPanel } from "~/components/dashboard/chat-panel"

function getInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark"
  const saved = localStorage.getItem("porter_theme")
  return saved === "light" ? "light" : "dark"
}

interface AppShellProps {
  children: ReactNode
  notificationCount?: number
  /** Hide the Porter chat sidebar strip (e.g. for auth pages) */
  hideChat?: boolean
}

export function AppShell({ children, notificationCount, hideChat }: AppShellProps) {
  return (
    <AuthGuard>
      <AppShellInner notificationCount={notificationCount} hideChat={hideChat}>{children}</AppShellInner>
    </AuthGuard>
  )
}

function AppShellInner({ children, notificationCount, hideChat }: { children: ReactNode; notificationCount?: number; hideChat?: boolean }) {
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)

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
            notificationCount={notificationCount}
          />
        </ErrorBoundary>
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <ErrorBoundary module="TopBar">
            <TopBar onToggleTheme={toggleTheme} theme={theme} notificationCount={notificationCount} />
          </ErrorBoundary>
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Page content — shrinks when chat expanded */}
            {!chatExpanded && (
              <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                <ErrorBoundary module="Content">{children}</ErrorBoundary>
              </div>
            )}

            {/* Chat — always present unless hideChat */}
            {!hideChat && (
              chatOpen ? (
                <ChatPanel
                  className={chatExpanded ? "flex-1" : "w-[300px] shrink-0"}
                  open={chatOpen}
                  onToggle={() => { setChatOpen(false); setChatExpanded(false) }}
                  onExpandChat={() => setChatExpanded(e => !e)}
                />
              ) : (
                <button
                  onClick={() => setChatOpen(true)}
                  className="shrink-0 w-8 border-l border-border flex items-center justify-center hover:bg-raised transition-colors"
                  title="Open chat"
                >
                  <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="short" size="xs" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </SessionProvider>
  )
}
