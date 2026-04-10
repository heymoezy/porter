import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type ClipboardEvent } from "react"
import { useSearchParams, Link } from "react-router"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Button } from "~/components/ui/button"
import { PorterLogo } from "~/components/porter-logo"
import { api } from "~/lib/api"

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  function handleDigitChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(""))
      inputRefs.current[5]?.focus()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")

    const code = digits.join("")
    if (code.length !== 6) {
      setError("Enter all 6 digits")
      return
    }

    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)

    try {
      await api("/api/v1/auth/reset-password", {
        method: "POST",
        json: { email, code, password },
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setLoading(false)
    }
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[360px] border-border bg-surface" style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}>
          <CardContent className="p-10 text-center">
            <PorterLogo size="lg" />
            <p className="mt-6 text-sm text-text2">No email specified.</p>
            <Link to="/forgot-password" className="mt-4 inline-block text-xs text-accent-porter hover:underline">
              Go to forgot password
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card
        className="w-full max-w-[360px] border-border bg-surface animate-page-fade-slide"
        style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}
      >
        <CardContent className="p-10">
          <div className="mb-8 flex justify-center">
            <PorterLogo size="lg" />
          </div>

          {success ? (
            <div className="text-center animate-page-fade-slide">
              <p className="text-sm text-success font-medium">Password reset successfully</p>
              <Link
                to="/login"
                className="mt-4 inline-block text-xs text-accent-porter hover:underline"
              >
                Sign in with your new password
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-center text-sm font-medium text-text2">
                Reset your password
              </h2>
              <p className="mb-6 text-center text-xs text-text3">
                Enter the code sent to <span className="font-medium text-text2">{email}</span>
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger animate-page-fade-slide">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 6-digit code inputs */}
                <div className="flex justify-center gap-2">
                  {digits.map((digit, i) => (
                    <Input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      className="h-12 w-10 text-center text-lg font-bold bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
                    />
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium text-text2">
                    New password
                  </Label>
                  <Input
                    id="password"
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
                  {loading ? "Resetting..." : "Reset password"}
                </Button>
              </form>

              <div className="mt-4 flex justify-center text-xs">
                <Link
                  to="/login"
                  className="text-text3 transition-colors hover:text-accent-porter"
                >
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
