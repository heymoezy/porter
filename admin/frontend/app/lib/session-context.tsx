import { createContext, useContext } from "react"

interface Session {
  username: string
  displayName: string
  role: string
  email?: string
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({
  session,
  children,
}: {
  session: Session
  children: React.ReactNode
}) {
  return <SessionContext value={session}>{children}</SessionContext>
}

export function useCurrentUser() {
  const session = useContext(SessionContext)
  if (!session)
    throw new Error("useCurrentUser must be used within SessionProvider")
  return session
}
