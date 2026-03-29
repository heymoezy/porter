import { useState } from "react"
import { useNavigate } from "react-router"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { api } from "~/lib/api"
import { type CustomerDetailResponse } from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "~/components/ui/avatar"
import {
  Phone,
  Building,
  Briefcase,
  MapPin,
  Linkedin,
  Github,
  ExternalLink,
  Edit2,
  Check,
  X,
  Loader2,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

interface ContactInfoCardProps {
  customer: Pick<
    CustomerDetailResponse["customer"],
    | "username"
    | "email"
    | "phone"
    | "company"
    | "job_title"
    | "country"
    | "city"
    | "bio"
    | "avatar_url"
    | "social_x"
    | "social_linkedin"
    | "social_github"
    | "email_verified"
  > & { display_name?: string | null }
  onSaved?: () => void
}

interface DomainPeersData {
  count: number
  peers: Array<{ username: string; display_name: string | null }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined, fallback: string): string {
  if (name && name.trim().length > 0) return name.trim()[0].toUpperCase()
  return fallback[0]?.toUpperCase() ?? "?"
}

function extractDomain(email: string | null): string | null {
  if (!email || !email.includes("@")) return null
  const domain = email.split("@")[1]
  if (!domain || !domain.includes(".")) return null
  return domain
}

// ── EditableField ──────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string
  fieldKey: string
  value: string | null
  icon?: React.ComponentType<{ className?: string }>
  href?: string
  onSave: (key: string, val: string | null) => Promise<void>
}

function EditableField({ label, fieldKey, value, icon: Icon, href, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await onSave(fieldKey, draft.trim() || null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(value ?? "")
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") handleCancel()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1">
        {Icon && <Icon className="size-3 text-text3/50 shrink-0" />}
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3/50 w-16 shrink-0">{label}</span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-6 text-2xs flex-1 px-1.5 py-0 border-border/50 bg-background"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-success hover:text-success/80"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-text3/50 hover:text-text"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="size-3" />
        </Button>
      </div>
    )
  }

  const hasValue = value !== null && value !== ""

  return (
    <div className="flex items-center gap-2 py-1 group cursor-default">
      {Icon && <Icon className="size-3 text-text3/50 shrink-0" />}
      <span className="text-2xs font-semibold uppercase tracking-wide text-text3/50 w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {hasValue ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text truncate hover:text-accent-porter flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="size-2.5 shrink-0 opacity-60" />
            </a>
          ) : (
            <span className="text-xs text-text truncate flex-1">{value}</span>
          )
        ) : (
          <span className="text-xs text-text3/30 italic">—</span>
        )}
      </div>
      <button
        className="opacity-0 group-hover:opacity-60 transition-opacity ml-auto shrink-0"
        onClick={() => {
          setDraft(value ?? "")
          setEditing(true)
        }}
        title={`Edit ${label}`}
      >
        <Edit2 className="size-3 text-text3" />
      </button>
    </div>
  )
}

// ── XIcon ──────────────────────────────────────────────────────────────────

function XIcon({ className }: { className?: string }) {
  return (
    <span className={`font-bold leading-none ${className ?? ""}`} style={{ fontFamily: "serif" }}>
      𝕏
    </span>
  )
}

// ── ContactInfoCard ────────────────────────────────────────────────────────

export function ContactInfoCard({ customer, onSaved }: ContactInfoCardProps) {
  const navigate = useNavigate()
  const [domainPeers, setDomainPeers] = useState<DomainPeersData | null>(null)

  const domain = extractDomain(customer.email)

  useMountEffect(() => {
    if (!domain) return
    api<DomainPeersData>(`/api/admin/customers/domain-peers/${encodeURIComponent(domain)}`)
      .then((data) => setDomainPeers(data))
      .catch(() => {/* ignore */})
  })

  async function handleSave(fieldKey: string, val: string | null) {
    await api(`/api/admin/customers/${customer.username}/profile`, {
      method: "PATCH",
      json: { [fieldKey]: val },
    })
    onSaved?.()
  }

  const initials = getInitials(
    (customer as { display_name?: string | null }).display_name,
    customer.username
  )

  const location = [customer.city, customer.country].filter(Boolean).join(", ") || null

  const peerCount = domainPeers?.count ?? 0

  return (
    <Card className="ring-0 border border-border/40">
      <CardContent className="p-3">

        {/* Avatar + email row */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <Avatar className="size-10 shrink-0">
            {customer.avatar_url ? (
              <AvatarImage src={customer.avatar_url} alt={customer.username} />
            ) : null}
            <AvatarFallback className="text-sm font-semibold bg-raised text-text">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {customer.email ? (
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-text truncate">{customer.email}</span>
                {customer.email_verified === 1 && (
                  <span title="Email verified" className="shrink-0">
                    <Check className="size-3 text-success" />
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-text3/30 italic">No email</span>
            )}
            <p className="text-2xs text-text3/50 mt-0.5 truncate">@{customer.username}</p>
          </div>
        </div>

        {/* Contact fields */}
        <div className="space-y-0">
          <EditableField
            label="Phone"
            fieldKey="phone"
            value={customer.phone}
            icon={Phone}
            onSave={handleSave}
          />
          <EditableField
            label="Company"
            fieldKey="company"
            value={customer.company}
            icon={Building}
            onSave={handleSave}
          />
          <EditableField
            label="Title"
            fieldKey="job_title"
            value={customer.job_title}
            icon={Briefcase}
            onSave={handleSave}
          />
          <EditableField
            label="Location"
            fieldKey="city"
            value={location}
            icon={MapPin}
            onSave={async (_key, val) => {
              // Location is display-only for city+country combo — save to city field
              await handleSave("city", val)
            }}
          />
          <EditableField
            label="Bio"
            fieldKey="bio"
            value={customer.bio}
            onSave={handleSave}
          />

          {/* Social links */}
          <EditableField
            label="X"
            fieldKey="social_x"
            value={customer.social_x}
            icon={XIcon}
            href={customer.social_x ? `https://x.com/${customer.social_x.replace(/^@/, "")}` : undefined}
            onSave={handleSave}
          />
          <EditableField
            label="LinkedIn"
            fieldKey="social_linkedin"
            value={customer.social_linkedin}
            icon={Linkedin}
            href={customer.social_linkedin ? `https://linkedin.com/in/${customer.social_linkedin.replace(/^\//, "")}` : undefined}
            onSave={handleSave}
          />
          <EditableField
            label="GitHub"
            fieldKey="social_github"
            value={customer.social_github}
            icon={Github}
            href={customer.social_github ? `https://github.com/${customer.social_github.replace(/^@/, "")}` : undefined}
            onSave={handleSave}
          />
        </div>

        {/* Domain peers badge */}
        {peerCount > 1 && domain && (
          <div className="mt-2.5 pt-2 border-t border-border/20">
            <Badge
              variant="outline"
              className="text-2xs cursor-pointer hover:bg-raised/50 transition-colors"
              onClick={() => navigate(`/customers?domain=${encodeURIComponent(domain)}`)}
            >
              {peerCount - 1} other{peerCount - 1 !== 1 ? "s" : ""} at @{domain}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
