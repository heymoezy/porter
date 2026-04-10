import { useState, type FormEvent } from "react"
import { useNavigate, Link } from "react-router"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Button } from "~/components/ui/button"
import { PorterLogo } from "~/components/porter-logo"
import { api } from "~/lib/api"

export default function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        json: { email, name, password },
      })
      navigate(`/verify-email?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[360px] border-border bg-surface animate-page-fade-slide"
        style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}
      >
        <CardContent className="p-10">
          <div className="mb-8 flex justify-center">
            <PorterLogo size="lg" />
          </div>

          <h2 className="mb-6 text-center text-sm font-medium text-text2">
            Create your account
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger animate-page-fade-slide">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-text2">
                First name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                autoFocus
                required
                className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
              />
            </div>

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
                autoComplete="new-password"
                required
                className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-xs font-medium text-text2">
                Confirm password
              </Label>
              <Input
                id="confirm"
                name="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-[120ms]"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>

            <p className="text-center text-[10px] leading-relaxed text-text3">
              By creating an account, you agree to our{" "}
              <Link to="/terms" className="text-accent-porter hover:underline" target="_blank">Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" className="text-accent-porter hover:underline" target="_blank">Privacy Policy</Link>
            </p>
          </form>

          <div className="mt-4 flex justify-center text-xs">
            <Link
              to="/login"
              className="text-text3 transition-colors hover:text-accent-porter"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
