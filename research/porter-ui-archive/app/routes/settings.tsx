import { useState } from "react"
import { AppShell } from "~/components/layout/app-shell"
import { PixelPortraitEditor, type AppearanceSpec } from "~/components/pixel-portrait-editor"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { Badge } from "~/components/ui/badge"
import {
  User, Shield, CreditCard,
  AlertTriangle, Trash2, Flame, Check,
  Zap, Clock, ExternalLink, Loader2,
} from "lucide-react"
import { useCurrentUser } from "~/lib/session-context"
import { useBilling, useCheckout, useBillingPortal, useUpdateProfile, useChangePassword } from "~/hooks/use-api"

const NAV = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Shield },
]

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {desc && <p className="text-xs text-text3 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-text2">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-text3">{hint}</p>}
    </div>
  )
}

function ProfileTab() {
  const user = useCurrentUser()
  const updateProfile = useUpdateProfile()

  // Load avatar from session (persisted in avatar_url as JSON)
  const savedAvatar = (() => {
    try { return user.avatarUrl ? JSON.parse(user.avatarUrl) : null } catch { return null }
  })()
  const [avatar, setAvatar] = useState<AppearanceSpec>(savedAvatar ?? {
    skin: "#E0AC69",
    hair: "#2C1B18",
    eyes: "#334155",
    shirt: "#6366F1",
    hairStyle: "short",
  })

  // Derive initial values from session — key reset handles re-init after save
  const initFirst = (() => {
    const parts = (user.fullName || "").trim().split(/\s+/)
    return parts[0] || user.displayName || user.username
  })()
  const initLast = (() => {
    const parts = (user.fullName || "").trim().split(/\s+/)
    return parts.slice(1).join(" ") || ""
  })()
  const [firstName, setFirstName] = useState(initFirst)
  const [lastName, setLastName] = useState(initLast)
  const [email, setEmail] = useState(user.email || "")
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")

  // Gamification — derived from session until XP backend exists
  const LEVELS = [
    { name: "Recruit", desc: "You just joined", unlock: "Access to chat with Porter" },
    { name: "Operator", desc: "Created your first agent", unlock: "Create up to 3 agents" },
    { name: "Handler", desc: "Running active projects", unlock: "Unlock project templates" },
    { name: "Commander", desc: "Power user with workflows", unlock: "Priority model routing" },
    { name: "Architect", desc: "Building complex systems", unlock: "Advanced agent delegation" },
    { name: "Director", desc: "Platform expert", unlock: "Early access to new features" },
  ]
  const currentLevel = 1 // TODO: derive from API when XP system is built
  const xp = 120
  const nextXp = 500
  const streak = 3
  const [showLevels, setShowLevels] = useState(false)

  return (
    <div className="space-y-8">
      {/* Gamification */}
      <div className="rounded-xl border border-accent-porter/20 bg-gradient-to-r from-accent-porter/5 to-transparent p-5">
        <div className="flex items-center gap-5">
          {/* Level badge */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-accent-porter bg-accent-porter/15 shadow-[0_0_16px_var(--accent-porter)]">
              <span className="text-lg font-bold text-accent-porter">{currentLevel + 1}</span>
            </div>
            <span className="text-xs font-bold text-accent-porter">{LEVELS[currentLevel].name}</span>
          </div>

          {/* XP progress */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">Level {currentLevel + 1} — {LEVELS[currentLevel].name}</span>
              <span className="text-[10px] text-text3 tabular-nums">{xp} / {nextXp} XP</span>
            </div>
            <div className="h-2 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full bg-accent-porter transition-all duration-700" style={{ width: `${(xp / nextXp) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-text3">Next: <span className="text-text2 font-medium">{LEVELS[currentLevel + 1]?.name}</span> — {nextXp - xp} XP to go</p>
              <button onClick={() => setShowLevels(s => !s)} className="text-[10px] text-accent-porter hover:underline">
                {showLevels ? "Hide levels" : "View all levels"}
              </button>
            </div>
          </div>

          {/* Streak */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <Flame className={`size-5 ${streak >= 7 ? "text-warning" : "text-text3"}`} />
            <span className="text-sm font-bold text-foreground">{streak}d</span>
            <span className="text-[9px] text-text3">streak</span>
          </div>
        </div>

        {/* Level details — expandable */}
        {showLevels && (
          <div className="mt-4 pt-4 border-t border-accent-porter/10 grid grid-cols-3 gap-2">
            {LEVELS.map((l, i) => (
              <div key={l.name} className={`rounded-lg p-3 transition-all ${
                i < currentLevel ? "bg-success/5 border border-success/20" :
                i === currentLevel ? "bg-accent-porter/10 border border-accent-porter/30 shadow-sm" :
                "bg-raised/50 border border-border"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`flex size-5 items-center justify-center rounded-full text-[9px] font-bold ${
                    i < currentLevel ? "bg-success/20 text-success" :
                    i === currentLevel ? "bg-accent-porter/20 text-accent-porter" :
                    "bg-border text-text3"
                  }`}>
                    {i < currentLevel ? <Check className="size-3" /> : i + 1}
                  </div>
                  <span className={`text-xs font-bold ${
                    i <= currentLevel ? "text-foreground" : "text-text3"
                  }`}>{l.name}</span>
                </div>
                <p className="text-[10px] text-text3 mb-1">{l.desc}</p>
                <p className="text-[10px] text-text2">
                  {i <= currentLevel ? "✓ " : "🔒 "}{l.unlock}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Section title="Avatar" desc="Your pixel portrait — visible across Porter">
        <PixelPortraitEditor value={avatar} onChange={setAvatar} />
      </Section>

      <Separator className="bg-border" />

      <Section title="Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <Field label="First name">
            <Input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </Field>
          <Field label="Last name">
            <Input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Optional"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </Field>
          <Field label="Email">
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Button
            className="bg-accent-porter text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all text-xs font-bold h-8"
            onClick={() => {
              setSaved(false)
              setSaveError("")
              updateProfile.mutate(
                { display_name: firstName, full_name: lastName ? `${firstName} ${lastName}` : firstName, email, avatar_url: JSON.stringify(avatar) },
                {
                  onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000) },
                  onError: (e: any) => { setSaveError(e?.message || "Failed to save"); setTimeout(() => setSaveError(""), 5000) },
                }
              )
            }}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? "Saving..." : "Save changes"}
          </Button>
          {saved && (
            <span className="text-xs text-success font-medium animate-in fade-in duration-200">
              Saved
            </span>
          )}
          {saveError && (
            <span className="text-xs text-danger font-medium animate-in fade-in duration-200">
              {saveError}
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}

function AccountTab() {
  const changePw = useChangePassword()
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSuccess, setPwSuccess] = useState(false)

  function handleChangePassword() {
    setPwError("")
    setPwSuccess(false)
    if (newPw !== confirmPw) {
      setPwError("Passwords don't match")
      return
    }
    if (newPw.length < 8) {
      setPwError("Password must be at least 8 characters")
      return
    }
    changePw.mutate(
      { new_password: newPw },
      {
        onSuccess: () => {
          setPwSuccess(true)
          setNewPw("")
          setConfirmPw("")
        },
        onError: (e) => setPwError(e.message || "Failed to change password"),
      }
    )
  }

  return (
    <div className="space-y-8">
      <Section title="Change Password">
        <div className="max-w-sm space-y-3">
          <Field label="New password">
            <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
          </Field>
          {pwError && <p className="text-[11px] text-danger">{pwError}</p>}
          {pwSuccess && <p className="text-[11px] text-success">Password updated</p>}
          <Button
            className="bg-accent-porter text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all text-xs font-bold h-8"
            onClick={handleChangePassword}
            disabled={changePw.isPending || !newPw}
          >
            {changePw.isPending ? "Updating..." : "Update password"}
          </Button>
        </div>
      </Section>

      <Separator className="bg-border" />

      <div className="max-w-lg rounded-lg border-2 border-danger/30 bg-danger/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-danger">Danger Zone</h3>
            <p className="text-xs text-text3 mt-1">Permanently delete your account and all associated data. This action cannot be undone.</p>
            <Button variant="destructive" size="sm" className="mt-3 gap-1.5 text-xs">
              <Trash2 className="h-3 w-3" />
              Delete account
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatDate(epoch: number | null): string {
  if (!epoch) return "—"
  return new Date(epoch * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/15 text-success",
  trialing: "bg-accent-porter/15 text-accent-porter",
  past_due: "bg-warning/15 text-warning",
  cancelled: "bg-danger/15 text-danger",
  expired: "bg-danger/15 text-danger",
  paused: "bg-text3/15 text-text3",
}

function BillingTab() {
  const { data, isLoading, error } = useBilling()
  const checkout = useCheckout()
  const portal = useBillingPortal()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-text3">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading billing...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-xs text-danger">Failed to load billing data</p>
      </div>
    )
  }

  const { plan, usage, billing_enabled } = data

  return (
    <div className="space-y-8">
      <Section title="Current Plan">
        <div className="max-w-md rounded-xl border border-accent-porter/30 bg-accent-porter/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{plan.planName}</p>
                <Badge className={`text-[8px] px-1.5 py-0 ${STATUS_COLORS[plan.status] || "bg-text3/15 text-text3"}`}>
                  {plan.status}
                </Badge>
              </div>
              <p className="text-xs text-text3 mt-0.5">Unlimited agents · Unlimited projects · BYOK</p>
            </div>
            {plan.price > 0 ? (
              <p className="text-2xl font-black text-foreground">
                ${plan.price / 100}<span className="text-sm font-normal text-text3">/mo</span>
              </p>
            ) : (
              <p className="text-2xl font-black text-foreground">Free</p>
            )}
          </div>

          {plan.isTrial && plan.trialDaysLeft !== null && (
            <>
              <Separator className="bg-border my-4" />
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-accent-porter" />
                <p className="text-xs text-accent-porter font-medium">
                  {plan.trialDaysLeft} day{plan.trialDaysLeft !== 1 ? "s" : ""} left in trial
                </p>
              </div>
            </>
          )}

          {plan.cancelAt && (
            <>
              <Separator className="bg-border my-4" />
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <p className="text-xs text-warning font-medium">Cancels {formatDate(plan.cancelAt)}</p>
              </div>
            </>
          )}

          <Separator className="bg-border my-4" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-text3">
              {plan.currentPeriodEnd
                ? `Next billing: ${formatDate(plan.currentPeriodEnd)}`
                : plan.isTrial
                  ? `Trial ends: ${formatDate(plan.trialDaysLeft !== null ? Date.now() / 1000 + plan.trialDaysLeft * 86400 : null)}`
                  : "No active billing"
              }
            </p>
            <div className="flex gap-2">
              {billing_enabled && plan.plan === "free" && (
                <Button
                  size="sm"
                  className="bg-accent-porter text-white hover:bg-accent-hover text-[10px] h-7 gap-1"
                  onClick={() => checkout.mutate("cloud", { onSuccess: (r) => window.open(r.checkout_url, "_blank") })}
                  disabled={checkout.isPending}
                >
                  {checkout.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Upgrade — $5/mo
                </Button>
              )}
              {billing_enabled && plan.plan !== "free" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-7 gap-1"
                  onClick={() => portal.mutate(undefined, { onSuccess: (r) => window.open(r.portal_url, "_blank") })}
                  disabled={portal.isPending}
                >
                  {portal.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                  Manage
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Usage This Month">
        <div className="max-w-md grid grid-cols-3 gap-3">
          {[
            { label: "Tokens", value: formatTokens(usage.totalTokens), limit: "∞" },
            { label: "Projects", value: String(usage.projects), limit: "∞" },
            { label: "Agents", value: String(usage.agents), limit: "∞" },
          ].map(u => (
            <div key={u.label} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text3">{u.label}</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{u.value}</p>
              <p className="text-[9px] text-text3">of {u.limit}</p>
            </div>
          ))}
        </div>
      </Section>

      {usage.byModel.length > 0 && (
        <Section title="Token Usage by Model">
          <div className="max-w-md space-y-1.5">
            {usage.byModel.map(m => (
              <div key={m.model} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{m.model}</p>
                  <p className="text-[10px] text-text3">
                    {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out · {m.requests} req
                  </p>
                </div>
                <p className="text-xs font-bold text-foreground tabular-nums">
                  {formatTokens(m.inputTokens + m.outputTokens)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Plans" desc="Porter is BYOK — bring your own API keys. We never charge for tokens.">
        <div className="max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: "Self-Hosted", price: "Free", desc: "Your hardware, full Porter", highlight: false },
            { name: "Cloud", price: "$5/mo", desc: "Hosted, all features, BYOK", highlight: true },
            { name: "Cloud Team", price: "$5/user/mo", desc: "Multi-user, RBAC, shared agents", highlight: false },
            { name: "Enterprise", price: "Custom", desc: "SSO, SLA, private infrastructure", highlight: false },
          ].map(t => (
            <div
              key={t.name}
              className={`rounded-lg border p-4 ${
                t.highlight ? "border-accent-porter bg-accent-porter/5" : "border-border bg-surface"
              }`}
            >
              <p className="text-xs font-bold text-foreground">{t.name}</p>
              <p className="text-lg font-black text-foreground mt-1">{t.price}</p>
              <p className="text-[10px] text-text3 mt-1">{t.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile")

  const tabs: Record<string, () => React.JSX.Element> = {
    profile: ProfileTab,
    account: AccountTab,
  }

  const ActiveTab = tabs[activeTab] ?? ProfileTab

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <div className="flex gap-6 max-w-[900px]">
            <nav className="w-[120px] shrink-0 space-y-0.5 sticky top-[var(--header-height)] self-start">
              {NAV.map(n => (
                <button
                  key={n.id}
                  onClick={() => setActiveTab(n.id)}
                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    activeTab === n.id
                      ? "bg-accent-porter/10 font-medium text-accent-porter"
                      : "text-text2 hover:bg-raised"
                  }`}
                >
                  <n.icon className="h-3.5 w-3.5" />
                  {n.label}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-w-0 min-h-[600px]">
              <ActiveTab />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
