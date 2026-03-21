import { useState } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Mail, Send, AlertCircle, Save, Check } from "lucide-react"

interface SmtpConfig {
  configured: boolean
  host: string
  port: number
  user: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
  replyTo: string
}

interface QueueData {
  pending: number
  sent: number
  failed: number
  recent: Array<{
    id: number
    to_email: string
    subject: string
    status: string
    error: string | null
    created_at: number
    sent_at: number | null
  }>
}

function EmailContent() {
  const qc = useQueryClient()
  const { data: config, isLoading } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api<SmtpConfig>("/api/admin/email/config"),
  })
  const { data: queue } = useQuery({
    queryKey: ["admin", "email", "queue"],
    queryFn: () => api<QueueData>("/api/admin/email/queue"),
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const saveConfig = useMutation({
    mutationFn: (data: Record<string, string>) =>
      api("/api/admin/email/config", { method: "PUT", json: data }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      qc.invalidateQueries({ queryKey: ["admin", "email", "config"] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const cfg = config ?? { configured: false, host: "", port: 587, user: "", hasPassword: false, fromName: "", fromEmail: "", replyTo: "" }

  function field(key: string, label: string, value: string, type = "text") {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-text3">{label}</Label>
        <Input
          type={type}
          defaultValue={value}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="h-7 text-xs bg-background border-border"
          placeholder={label}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
        <Mail className="size-3 text-accent-porter" />
        <div className="flex items-center gap-4 text-xs">
          <span className="text-text3">Pending <span className="font-bold text-warning">{queue?.pending ?? 0}</span></span>
          <span className="text-text3">Sent <span className="font-bold text-success">{queue?.sent ?? 0}</span></span>
          <span className="text-text3">Failed <span className="font-bold text-danger">{queue?.failed ?? 0}</span></span>
        </div>
        <Badge className={`text-[10px] border-0 ml-auto ${cfg.configured ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
          {cfg.configured ? "configured" : "not configured"}
        </Badge>
      </div>

      {/* SMTP Config Form */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">SMTP Configuration</span>
          <Button
            size="sm"
            onClick={() => saveConfig.mutate(form)}
            disabled={Object.keys(form).length === 0}
            className="h-6 text-xs gap-1"
          >
            {saved ? <Check className="size-3" /> : <Save className="size-3" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {field("smtp_host", "SMTP Host", cfg.host)}
          {field("smtp_port", "Port", String(cfg.port), "number")}
          {field("smtp_user", "Username", cfg.user)}
          {field("smtp_pass", "Password", cfg.hasPassword ? "••••••" : "", "password")}
          {field("smtp_from_name", "From Name", cfg.fromName)}
          {field("smtp_from_email", "From Email", cfg.fromEmail, "email")}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {field("smtp_reply_to", "Reply-To", cfg.replyTo, "email")}
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled>
              <Send className="size-3" /> Send Test
            </Button>
          </div>
        </div>
      </div>

      {/* Queue Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
          <Send className="size-3 text-accent-porter" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Recent Queue</span>
        </div>
        {!queue?.recent?.length ? (
          <div className="px-3 py-4 text-center text-xs text-text3">No emails in queue</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">To</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Subject</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.recent.map(e => (
                <tr key={e.id} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs text-text">{e.to_email}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 truncate max-w-[200px]">{e.subject}</td>
                  <td className="px-3 py-1.5">
                    <Badge className={`text-[10px] border-0 ${
                      e.status === "sent" ? "bg-success/15 text-success" :
                      e.status === "failed" ? "bg-danger/15 text-danger" :
                      "bg-warning/15 text-warning"
                    }`}>{e.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function EmailPage() {
  return (
    <AdminShell>
      <EmailContent />
    </AdminShell>
  )
}
