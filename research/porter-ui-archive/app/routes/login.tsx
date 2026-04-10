import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { PorterLogo } from "~/components/porter-logo"
import { login, ApiError } from "~/lib/api"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await login(email, password)
      navigate("/")
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`)
        return
      }
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
            <PorterLogo size="lg" />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger animate-page-fade-slide">
              {error}
            </div>
          )}

          {/* Social login */}
          <div className="flex gap-2.5 mb-5">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border2 bg-raised px-3 py-2 text-xs font-medium text-foreground transition-all duration-[var(--duration-fast)] hover:bg-border hover:-translate-y-px hover:shadow-[var(--shadow-sm)]">
              <GoogleIcon className="h-3.5 w-3.5" />
              Google
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border2 bg-raised px-3 py-2 text-xs font-medium text-foreground transition-all duration-[var(--duration-fast)] hover:bg-border hover:-translate-y-px hover:shadow-[var(--shadow-sm)]">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-5">
            <Separator className="bg-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface px-3 text-[10px] font-medium uppercase tracking-widest text-text3">
              or
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-text2">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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

          {/* Links */}
          <div className="mt-5 flex justify-center gap-4">
            <Link
              to="/register"
              className="text-xs text-text3 transition-colors hover:text-accent-porter"
            >
              Create account
            </Link>
            <Link
              to="/forgot-password"
              className="text-xs text-text3 transition-colors hover:text-accent-porter"
            >
              Forgot password?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
