import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { PorterLogo } from "~/components/porter-logo"
import { login, getSession } from "~/lib/api"

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await login(username, password)
      const session = await getSession()

      if (!session || session.role !== "platform_admin") {
        setError("Access denied. Platform admin privileges required.")
        setLoading(false)
        return
      }

      navigate("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card
        className="w-full max-w-[360px] border-border bg-surface animate-page-fade-slide"
        style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}
      >
        <CardContent className="p-10">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <PorterLogo size="lg" label="Admin" />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger animate-page-fade-slide">
              {error}
            </div>
          )}

          {/* Divider */}
          <div className="relative mb-5">
            <Separator className="bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-medium text-text2">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                autoFocus
                required
                className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-text2">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                required
                className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-[var(--duration-fast)]"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
