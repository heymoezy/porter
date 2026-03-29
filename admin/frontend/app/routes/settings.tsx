import { useState } from "react"
import { PixelPortraitEditor } from "~/components/pixel-portrait-editor"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { User, Shield } from "lucide-react"
import { api } from "~/lib/api"
import { useSession } from "~/hooks/use-api"
import { useQueryClient } from "@tanstack/react-query"

const NAV = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Shield },
]

function ProfileTab() {
  const { data: session } = useSession()
  const qc = useQueryClient()

  const saved = (() => {
    try { return session?.avatarUrl ? JSON.parse(session.avatarUrl) : null } catch { return null }
  })()

  const [avatar, setAvatar] = useState(saved ?? {
    skin: "#E0AC69",
    hair: "#2C1B18",
    eyes: "#334155",
    shirt: "#6366F1",
    hairStyle: "short" as const,
  })
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaveOk(false)
    try {
      await api("/api/v1/auth/update-avatar", { method: "POST", json: { avatar_url: JSON.stringify(avatar) } })
      qc.invalidateQueries({ queryKey: ["session"] })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-2xs font-bold uppercase tracking-widest text-text3 mb-3">Avatar</p>
        <PixelPortraitEditor value={avatar} onChange={(v: any) => setAvatar(v)} />
        <div className="flex items-center gap-3 mt-4">
          <Button size="sm" className="bg-accent-porter hover:bg-accent-hover text-white text-xs h-7 px-5"
            onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save avatar"}
          </Button>
          {saveOk && <span className="text-xs text-success">Saved</span>}
        </div>
      </div>
    </div>
  )
}

function AccountTab() {
  const { data: session } = useSession()
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSuccess, setPwSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleChangePassword() {
    setPwError("")
    setPwSuccess(false)
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return }
    if (newPw.length < 8) { setPwError("Must be at least 8 characters"); return }
    setSaving(true)
    try {
      await api("/api/v1/auth/change-password", { method: "POST", json: { new_password: newPw } })
      setPwSuccess(true)
      setNewPw("")
      setConfirmPw("")
    } catch (e: any) {
      setPwError(e.message || "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-2xs font-bold uppercase tracking-widest text-text3 mb-3">Change Password</p>
        <div className="max-w-sm space-y-3">
          <div className="space-y-1.5">
            <Label className="text-2xs text-text2">New password</Label>
            <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              className="h-8 bg-background border-border text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-2xs text-text2">Confirm new password</Label>
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              className="h-8 bg-background border-border text-xs" />
          </div>
          {pwError && <p className="text-2xs text-danger">{pwError}</p>}
          {pwSuccess && <p className="text-2xs text-success">Password updated</p>}
          <Button size="sm" className="bg-accent-porter hover:bg-accent-hover text-white text-xs h-7 px-5"
            onClick={handleChangePassword} disabled={saving || !newPw}>
            {saving ? "Updating..." : "Update password"}
          </Button>
        </div>
      </div>

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

            <div className="flex-1 min-w-0">
              <ActiveTab />
            </div>
          </div>
        </div>
      </div>
  )
}
