import { useSession } from "~/hooks/use-api"

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { data: session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (!session || session.role !== "platform_admin") {
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
    return fallback ?? null
  }

  return <>{children}</>
}
