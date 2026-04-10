import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type ClipboardEvent } from "react"
import { useNavigate, useSearchParams, Link } from "react-router"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import { PorterLogo } from "~/components/porter-logo"
import { api } from "~/lib/api"

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  function handleDigitChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return

    const next = [...digits]
    next[index] = value
    setDigits(next)

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 filled
    if (value && index === 5 && next.every(d => d)) {
      submitCode(next.join(""))
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
      const next = text.split("")
      setDigits(next)
      inputRefs.current[5]?.focus()
      submitCode(text)
    }
  }

  async function submitCode(code: string) {
    setError("")
    setLoading(true)

    try {
      await api("/api/v1/auth/verify-email", {
        method: "POST",
        json: { email, code },
      })
      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
      setDigits(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = digits.join("")
    if (code.length !== 6) {
      setError("Enter all 6 digits")
      return
    }
    submitCode(code)
  }

  async function handleResend() {
    setResent(false)
    try {
      await api("/api/v1/auth/resend-code", {
        method: "POST",
        json: { email },
      })
      setResent(true)
    } catch {
      setError("Failed to resend code")
    }
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[360px] border-border bg-surface" style={{ borderRadius: "14px", boxShadow: "var(--shadow-auth)" }}>
          <CardContent className="p-10 text-center">
            <PorterLogo size="lg" />
            <p className="mt-6 text-sm text-text2">No email specified.</p>
            <Link to="/register" className="mt-4 inline-block text-xs text-accent-porter hover:underline">
              Go to registration
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

          <h2 className="mb-2 text-center text-sm font-medium text-text2">
            Check your email
          </h2>
          <p className="mb-6 text-center text-xs text-text3">
            We sent a 6-digit code to <span className="font-medium text-text2">{email}</span>
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger animate-page-fade-slide">
              {error}
            </div>
          )}

          {resent && (
            <div className="mb-4 rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-sm text-success animate-page-fade-slide">
              Code resent
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* 6-digit code inputs */}
            <div className="flex justify-center gap-2 mb-6">
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

            <Button
              type="submit"
              disabled={loading || digits.some(d => !d)}
              className="w-full bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-[120ms]"
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </form>

          <div className="mt-5 flex justify-center gap-4">
            <button
              type="button"
              onClick={handleResend}
              className="text-xs text-text3 transition-colors hover:text-accent-porter"
            >
              Resend code
            </button>
            <Link
              to="/login"
              className="text-xs text-text3 transition-colors hover:text-accent-porter"
            >
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
