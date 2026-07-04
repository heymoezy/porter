import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"

interface SessionData {
  username: string
  displayName: string
  role: string
  email?: string
  avatarUrl?: string | null
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () =>
      api<SessionData>("/api/v1/auth/me").catch(() => null),
    staleTime: 60_000,
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api("/api/v1/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear()
      window.location.href = "/login"
    },
  })
}
