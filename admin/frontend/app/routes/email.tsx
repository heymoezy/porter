import { useState, useRef } from "react"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Inbox, Send, FileText, Trash2, Plus, ArrowLeft, Mail,
  Bold, Italic, Link, List, ListOrdered, Code, Heading,
  ChevronDown, Settings, Check, AlertTriangle,
} from "lucide-react"
import { Label } from "~/components/ui/label"

interface EmailMessage {
  id: number
  folder: string
  from_email: string
  from_name: string
  to_email: string
  to_name: string
  subject: string
  status: string
  body?: string
  body_html?: string
  preview?: string
  sent_at: number | null
  read_at: number | null
  created_at: number
}

type Folder = "inbox" | "sent" | "drafts" | "trash"

const folders: Array<{ id: Folder; label: string; icon: React.ElementType }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "trash", label: "Trash", icon: Trash2 },
]

interface MailIdentity {
  mailboxId: string
  address: string
  displayName: string
  agentId: string
  agentName: string
  role: string
  isPrimary: boolean
}

function fmtDate(ts: number | null) {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Strip dangerous HTML: script tags, event handlers, javascript: URLs */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, "")
    .replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""')
}

function EmailContent() {
  const qc = useQueryClient()
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeData, setComposeData] = useState({ from: "", to: "", subject: "", body: "" })
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showSmtp, setShowSmtp] = useState(false)
  const [smtpForm, setSmtpForm] = useState<Record<string, string>>({})
  const editorRef = useRef<HTMLDivElement>(null)

  const { data: smtpData } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api<{ configured: boolean; host: string; port: number; user: string; hasPassword: boolean; fromName: string; fromEmail: string; replyTo: string }>("/api/admin/email/config"),
  })

  const identitiesQuery = useQuery({
    queryKey: ["mail", "identities"],
    queryFn: () => api<{ identities: MailIdentity[] }>("/api/v1/mail"),
  })

  const senders = (identitiesQuery.data?.identities ?? []).map(i => ({
    id: i.mailboxId,
    name: i.displayName || i.agentName,
    email: i.address,
    role: i.role || "Agent",
    agentId: i.agentId,
  }))

  const saveSmtp = useMutation({
    mutationFn: (data: Record<string, string>) => api("/api/admin/email/config", { method: "PUT", json: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "email", "config"] }),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ["admin", "email", "messages", activeFolder],
    queryFn: () => api<{ messages: EmailMessage[]; folderCounts: Record<string, number> }>(`/api/admin/email/messages?folder=${activeFolder}`),
  })

  const { data: msgData } = useQuery({
    queryKey: ["admin", "email", "message", selectedId],
    queryFn: () => api<EmailMessage>(`/api/admin/email/messages/${selectedId}`),
    enabled: !!selectedId,
  })

  const sendMessage = useMutation({
    mutationFn: (data: { from_name: string; from_email: string; to_email: string; subject: string; body: string; body_html: string; send: string }) =>
      api("/api/admin/email/messages", { method: "POST", json: data }),
    onSuccess: () => {
      setComposing(false)
      setComposeData({ from: "", to: "", subject: "", body: "" })
      qc.invalidateQueries({ queryKey: ["admin", "email"] })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: (id: number) => api(`/api/admin/email/messages/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["admin", "email"] }) },
  })

  const messages = listData?.messages ?? []
  const counts = listData?.folderCounts ?? {}
  const primaryIdentity = identitiesQuery.data?.identities?.find(i => i.isPrimary)
  const defaultSenderId = primaryIdentity?.mailboxId ?? senders[0]?.id ?? ""
  const activeSender = senders.find(s => s.id === (composeData.from || defaultSenderId)) ?? senders[0]

  function execFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleSend(asDraft: boolean) {
    if (!activeSender) return
    const html = editorRef.current?.innerHTML || ""
    const text = editorRef.current?.textContent || ""
    sendMessage.mutate({
      from_name: activeSender.name,
      from_email: activeSender.email,
      to_email: composeData.to,
      subject: composeData.subject,
      body: text,
      body_html: html,
      send: asDraft ? "false" : "true",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-var(--header-height)-2rem)] px-4 pb-4">
      {/* SMTP status bar */}
      {smtpData && !smtpData.configured && (
        <div className="shrink-0 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-1.5">
          <AlertTriangle className="size-3.5 text-warning shrink-0" />
          <p className="text-2xs text-warning flex-1">SMTP not configured — emails can't be sent</p>
          <Button variant="ghost" size="xs" onClick={() => setShowSmtp(true)} className="text-warning">Configure</Button>
        </div>
      )}

      {/* SMTP config panel */}
      {showSmtp && (
        <div className="shrink-0 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-text3">SMTP Configuration</p>
            <Button variant="ghost" size="xs" onClick={() => setShowSmtp(false)}>Close</Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-2xs text-text3">Host</Label>
              <Input className="h-7 text-xs mt-1" defaultValue={smtpData?.host} onChange={e => setSmtpForm(p => ({ ...p, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <Label className="text-2xs text-text3">Port</Label>
              <Input className="h-7 text-xs mt-1" defaultValue={String(smtpData?.port ?? 587)} onChange={e => setSmtpForm(p => ({ ...p, smtp_port: e.target.value }))} placeholder="587" />
            </div>
            <div>
              <Label className="text-2xs text-text3">Username</Label>
              <Input className="h-7 text-xs mt-1" defaultValue={smtpData?.user} onChange={e => setSmtpForm(p => ({ ...p, smtp_user: e.target.value }))} placeholder="user@domain.com" />
            </div>
            <div>
              <Label className="text-2xs text-text3">Password {smtpData?.hasPassword && <Check className="inline size-2.5 text-success" />}</Label>
              <Input className="h-7 text-xs mt-1" type="password" onChange={e => setSmtpForm(p => ({ ...p, smtp_pass: e.target.value }))} placeholder={smtpData?.hasPassword ? "••••••••" : "password"} />
            </div>
            <div>
              <Label className="text-2xs text-text3">From Name</Label>
              <Input className="h-7 text-xs mt-1" defaultValue={smtpData?.fromName} onChange={e => setSmtpForm(p => ({ ...p, smtp_from_name: e.target.value }))} placeholder="Porter" />
            </div>
            <div>
              <Label className="text-2xs text-text3">From Email</Label>
              <Input className="h-7 text-xs mt-1" defaultValue={smtpData?.fromEmail} onChange={e => setSmtpForm(p => ({ ...p, smtp_from_email: e.target.value }))} placeholder="porter@domain.com" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" onClick={() => { saveSmtp.mutate(smtpForm); setShowSmtp(false) }} disabled={saveSmtp.isPending}>
              {saveSmtp.isPending ? "Saving..." : "Save"}
            </Button>
            <span className="text-2xs text-text3">Settings stored in database, override env vars</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-1 min-h-0">
      {/* Folder sidebar */}
      <div className="w-[140px] shrink-0 space-y-0.5">
        <Button size="sm" className="w-full gap-1 mb-2 h-7 text-xs" onClick={() => { setComposing(true); setSelectedId(null) }}>
          <Plus className="size-3" /> Compose
        </Button>
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => { setActiveFolder(f.id); setSelectedId(null); setComposing(false) }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
              activeFolder === f.id ? "bg-accent-porter/15 text-accent-porter font-medium" : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
          >
            <f.icon className="size-3" />
            <span className="flex-1 text-left">{f.label}</span>
            {(counts[f.id] ?? 0) > 0 && <span className="text-2xs text-text3">{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 rounded-xl border border-border overflow-hidden flex flex-col">
        {composing ? (
          <div className="flex-1 flex flex-col">
            {/* Compose header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
              <div className="flex items-center gap-2">
                <button onClick={() => setComposing(false)} className="text-text3 hover:text-text2"><ArrowLeft className="size-3" /></button>
                <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Compose</span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-2xs" onClick={() => handleSend(true)} disabled={!activeSender}>Draft</Button>
                <Button size="sm" className="h-6 text-2xs gap-1" onClick={() => handleSend(false)} disabled={!activeSender}><Send className="size-2.5" /> Send</Button>
              </div>
            </div>

            {/* From — loading / empty / picker */}
            {identitiesQuery.isLoading ? (
              <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                <span className="text-2xs text-text3 w-10">From</span>
                <div className="size-3.5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
                <span className="text-2xs text-text3">Loading mailboxes...</span>
              </div>
            ) : senders.length === 0 ? (
              <div className="px-3 py-3 border-b border-border/50 flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-warning shrink-0" />
                <span className="text-xs text-text3">No mailboxes provisioned. Go to <strong className="text-text2">Admin &gt; Mail</strong> to set up agent mailboxes.</span>
              </div>
            ) : (
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2 relative">
              <span className="text-2xs text-text3 w-10">From</span>
              <button
                onClick={() => setShowFromPicker(!showFromPicker)}
                className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs hover:bg-raised transition-colors"
              >
                <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0">{activeSender?.role}</Badge>
                <span className="font-medium text-text">{activeSender?.name}</span>
                <span className="text-text3">&lt;{activeSender?.email}&gt;</span>
                <ChevronDown className="size-2.5 text-text3" />
              </button>
              {showFromPicker && (
                <div className="absolute top-full left-12 z-50 mt-1 rounded-lg border border-border bg-surface shadow-lg py-1 w-[280px]">
                  {senders.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setComposeData(d => ({ ...d, from: s.id })); setShowFromPicker(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-raised transition-colors ${s.id === (composeData.from || defaultSenderId) ? "bg-accent-porter/10" : ""}`}
                    >
                      <Badge className="text-2xs bg-text3/15 text-text3 border-0 w-12 justify-center">{s.role}</Badge>
                      <span className="font-medium text-text">{s.name}</span>
                      <span className="text-text3 text-2xs">{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* To */}
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2">
              <span className="text-2xs text-text3 w-10">To</span>
              <Input
                value={composeData.to}
                onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                className="h-6 text-xs bg-transparent border-0 focus-visible:ring-0 p-0"
                placeholder="recipient@email.com"
              />
            </div>

            {/* Subject */}
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2">
              <span className="text-2xs text-text3 w-10">Subject</span>
              <Input
                value={composeData.subject}
                onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                className="h-6 text-xs bg-transparent border-0 focus-visible:ring-0 p-0"
                placeholder="Subject"
              />
            </div>

            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 px-3 py-1 border-b border-border/50 bg-background/50">
              {[
                { icon: Bold, cmd: "bold" },
                { icon: Italic, cmd: "italic" },
                { icon: Code, cmd: "insertHTML", val: "<code>" },
                { icon: Heading, cmd: "formatBlock", val: "h3" },
                { icon: List, cmd: "insertUnorderedList" },
                { icon: ListOrdered, cmd: "insertOrderedList" },
                { icon: Link, cmd: "createLink", val: "prompt" },
              ].map(({ icon: Icon, cmd, val }) => (
                <button
                  key={cmd + (val || "")}
                  onClick={() => {
                    if (cmd === "createLink") {
                      const url = window.prompt("URL:")
                      if (url) execFormat(cmd, url)
                    } else {
                      execFormat(cmd, val)
                    }
                  }}
                  className="flex size-6 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2 transition-colors"
                >
                  <Icon className="size-3" />
                </button>
              ))}
            </div>

            {/* Rich editor */}
            <div
              ref={editorRef}
              contentEditable
              className="flex-1 p-3 text-xs text-text bg-background resize-none focus:outline-none overflow-y-auto [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-1 [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
              suppressContentEditableWarning
              data-placeholder="Write your message..."
            />
          </div>
        ) : selectedId && msgData ? (
          /* Message detail */
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
              <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs text-text3 hover:text-text2">
                <ArrowLeft className="size-3" /> Back
              </button>
              <Button variant="ghost" size="sm" className="h-6 text-2xs text-danger" onClick={() => deleteMessage.mutate(selectedId)}>
                <Trash2 className="size-2.5 mr-1" /> Delete
              </Button>
            </div>
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-sm font-bold text-text">{msgData.subject || "(no subject)"}</p>
              <div className="flex items-center gap-2 mt-1 text-2xs">
                <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0">{msgData.from_name || "Porter"}</Badge>
                <span className="text-text3">{msgData.from_email}</span>
                <span className="text-text3">→</span>
                <span className="text-text2">{msgData.to_name || msgData.to_email}</span>
                <span className="ml-auto text-text3">{fmtDate(msgData.sent_at || msgData.created_at)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {msgData.body_html ? (
                <div className="text-xs text-text2 leading-relaxed [&_h3]:text-sm [&_h3]:font-bold [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msgData.body_html) }} />
              ) : (
                <div className="text-xs text-text2 leading-relaxed whitespace-pre-wrap">{msgData.body || "(empty)"}</div>
              )}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface">
              <Mail className="size-3 text-accent-porter" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-text3">{activeFolder} ({messages.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-text3">No messages</div>
              ) : (
                messages.map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => setSelectedId(msg.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left border-b border-border/20 hover:bg-surface/60 transition-colors ${
                      !msg.read_at && msg.folder === "inbox" ? "bg-accent-porter/5" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge className="text-2xs bg-text3/15 text-text3 border-0 shrink-0">{msg.from_name || "Porter"}</Badge>
                        <span className={`text-xs truncate ${!msg.read_at && msg.folder === "inbox" ? "font-bold text-text" : "text-text2"}`}>
                          {msg.folder === "sent" ? `→ ${msg.to_email}` : msg.from_email}
                        </span>
                        <span className="text-2xs text-text3 ml-auto shrink-0">{fmtDate(msg.sent_at || msg.created_at)}</span>
                      </div>
                      <p className="text-2xs text-text3 truncate">{msg.subject || "(no subject)"}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

export default function EmailPage() {
  return (
    <>
      <div className="px-4 pt-4">
        <AgentPresenceSummary surface="email" className="mb-3" />
      </div>
      <EmailContent />
    </>
  )
}
