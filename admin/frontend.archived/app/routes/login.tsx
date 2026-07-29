import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { PorterLogo } from "~/components/porter-logo"
import { login, getSession, api } from "~/lib/api"

/**
 * Three states, one card. Recovery has to live HERE — its whole purpose is to
 * be reachable by someone who cannot get in, so it must not sit behind the
 * thing they cannot pass.
 */
type Mode = "signin" | "request-code" | "reset"

/** Shared so the eye toggle behaves identically everywhere a password is typed. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  hint?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-text2">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete ?? "off"}
          data-1p-ignore
          data-lpignore="true"
          required
          className="bg-raised border-border2 pr-10 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
        />
        <button
          // MUST be type=button: a bare <button> inside a <form> defaults to
          // submit, so revealing the password would post the form instead.
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-text3 transition-colors hover:text-text2"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] leading-tight text-text3">{hint}</p>}
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(false)

  function switchTo(next: Mode) {
    setMode(next)
    setError("")
    setNotice("")
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
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

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api("/api/v1/auth/forgot-password", { method: "POST", json: { email } })
      setMode("reset")
      // The server answers identically whether or not the address has an
      // account, so it cannot be used to discover who is registered. Word this
      // to match that, rather than promising mail is definitely on its way.
      setNotice("If that address has an account, a 6-digit code is on its way. It expires in 15 minutes.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a code")
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api("/api/v1/auth/reset-password", {
        method: "POST",
        json: { email, code: code.trim(), password: newPassword },
      })
      setPassword("")
      setCode("")
      setNewPassword("")
      setMode("signin")
      setNotice("Password updated. Sign in with your new password.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password")
    } finally {
      setLoading(false)
    }
  }

  const primaryBtn =
    "mt-2 w-full bg-accent-porter font-bold text-white transition-all duration-[var(--duration-fast)] hover:-translate-y-px hover:bg-accent-hover hover:shadow-[var(--shadow-accent-glow)]"
  const linkBtn = "text-text3 transition-colors hover:text-text2"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card
        className="w-full max-w-[360px] border-border bg-surface animate-page-fade-slide"
        style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}
      >
        <CardContent className="p-10">
          <div className="mb-8 flex justify-center">
            <PorterLogo size="lg" label="Admin" />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger animate-page-fade-slide">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg border border-border2 bg-raised px-3 py-2 text-sm text-text2 animate-page-fade-slide">
              {notice}
            </div>
          )}

          <div className="relative mb-5">
            <Separator className="bg-border" />
          </div>

          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-text2">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
                />
              </div>

              <PasswordField id="password" label="Password" value={password} onChange={setPassword} />

              <Button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              <button
                type="button"
                onClick={() => switchTo("request-code")}
                className={`w-full pt-1 text-center text-xs ${linkBtn}`}
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === "request-code" && (
            <form onSubmit={handleRequestCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-xs font-medium text-text2">
                  Email
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter"
                />
                <p className="text-[11px] leading-tight text-text3">
                  We'll send a 6-digit code to this address.
                </p>
              </div>

              <Button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? "Sending..." : "Send code"}
              </Button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button type="button" onClick={() => switchTo("signin")} className={linkBtn}>
                  Back to sign in
                </button>
                <button type="button" onClick={() => switchTo("reset")} className={linkBtn}>
                  I already have a code
                </button>
              </div>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={handleReset} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-xs font-medium text-text2">
                  6-digit code
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                  className="bg-raised border-border2 text-center font-mono text-lg tracking-[0.4em] text-foreground focus-visible:ring-accent-porter"
                />
              </div>

              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                hint="At least 8 characters."
              />

              <Button
                type="submit"
                disabled={loading || code.length !== 6 || newPassword.length < 8}
                className={primaryBtn}
              >
                {loading ? "Updating..." : "Set new password"}
              </Button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button type="button" onClick={() => switchTo("signin")} className={linkBtn}>
                  Back to sign in
                </button>
                <button type="button" onClick={() => switchTo("request-code")} className={linkBtn}>
                  Send a new code
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
