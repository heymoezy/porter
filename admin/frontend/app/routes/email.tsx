import { useState, useRef } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Inbox, Send, FileText, Trash2, Plus, ArrowLeft, Mail,
  Bold, Italic, Link, List, ListOrdered, Code, Heading,
  ChevronDown,
} from "lucide-react"

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

const senders = [
  { id: "porter", name: "Porter", email: "porter@askporter.app", role: "System" },
  { id: "growth", name: "Growth", email: "growth@askporter.app", role: "Agent" },
  { id: "retention", name: "Retention", email: "retention@askporter.app", role: "Agent" },
  { id: "security", name: "Security", email: "security@askporter.app", role: "Agent" },
  { id: "billing", name: "Billing", email: "billing@askporter.app", role: "Staff" },
  { id: "support", name: "Support", email: "support@askporter.app", role: "Staff" },
  { id: "moe", name: "Moe", email: "moe@askporter.app", role: "Admin" },
]

function fmtDate(ts: number | null) {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function EmailContent() {
  const qc = useQueryClient()
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeData, setComposeData] = useState({ from: "porter", to: "", subject: "", body: "" })
  const [showFromPicker, setShowFromPicker] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

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
      setComposeData({ from: "porter", to: "", subject: "", body: "" })
      qc.invalidateQueries({ queryKey: ["admin", "email"] })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: (id: number) => api(`/api/admin/email/messages/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["admin", "email"] }) },
  })

  const messages = listData?.messages ?? []
  const counts = listData?.folderCounts ?? {}
  const activeSender = senders.find(s => s.id === composeData.from) || senders[0]

  function execFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleSend(asDraft: boolean) {
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
    <div className="flex gap-2 h-[calc(100vh-var(--header-height)-2rem)]">
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
            {(counts[f.id] ?? 0) > 0 && <span className="text-[10px] text-text3">{counts[f.id]}</span>}
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
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Compose</span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => handleSend(true)}>Draft</Button>
                <Button size="sm" className="h-6 text-[11px] gap-1" onClick={() => handleSend(false)}><Send className="size-2.5" /> Send</Button>
              </div>
            </div>

            {/* From */}
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2 relative">
              <span className="text-[11px] text-text3 w-10">From</span>
              <button
                onClick={() => setShowFromPicker(!showFromPicker)}
                className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs hover:bg-raised transition-colors"
              >
                <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">{activeSender.role}</Badge>
                <span className="font-medium text-text">{activeSender.name}</span>
                <span className="text-text3">&lt;{activeSender.email}&gt;</span>
                <ChevronDown className="size-2.5 text-text3" />
              </button>
              {showFromPicker && (
                <div className="absolute top-full left-12 z-50 mt-1 rounded-lg border border-border bg-surface shadow-lg py-1 w-[280px]">
                  {senders.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setComposeData(d => ({ ...d, from: s.id })); setShowFromPicker(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-raised transition-colors ${s.id === composeData.from ? "bg-accent-porter/10" : ""}`}
                    >
                      <Badge className="text-[9px] bg-text3/15 text-text3 border-0 w-12 justify-center">{s.role}</Badge>
                      <span className="font-medium text-text">{s.name}</span>
                      <span className="text-text3 text-[10px]">{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* To */}
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2">
              <span className="text-[11px] text-text3 w-10">To</span>
              <Input
                value={composeData.to}
                onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                className="h-6 text-xs bg-transparent border-0 focus-visible:ring-0 p-0"
                placeholder="recipient@email.com"
              />
            </div>

            {/* Subject */}
            <div className="px-3 py-1 border-b border-border/50 flex items-center gap-2">
              <span className="text-[11px] text-text3 w-10">Subject</span>
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
              <Button variant="ghost" size="sm" className="h-6 text-[11px] text-danger" onClick={() => deleteMessage.mutate(selectedId)}>
                <Trash2 className="size-2.5 mr-1" /> Delete
              </Button>
            </div>
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-sm font-bold text-text">{msgData.subject || "(no subject)"}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">{msgData.from_name || "Porter"}</Badge>
                <span className="text-text3">{msgData.from_email}</span>
                <span className="text-text3">→</span>
                <span className="text-text2">{msgData.to_name || msgData.to_email}</span>
                <span className="ml-auto text-text3">{fmtDate(msgData.sent_at || msgData.created_at)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {msgData.body_html ? (
                <div className="text-xs text-text2 leading-relaxed [&_h3]:text-sm [&_h3]:font-bold [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter" dangerouslySetInnerHTML={{ __html: msgData.body_html }} />
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
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{activeFolder} ({messages.length})</span>
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
                        <Badge className="text-[9px] bg-text3/15 text-text3 border-0 shrink-0">{msg.from_name || "Porter"}</Badge>
                        <span className={`text-xs truncate ${!msg.read_at && msg.folder === "inbox" ? "font-bold text-text" : "text-text2"}`}>
                          {msg.folder === "sent" ? `→ ${msg.to_email}` : msg.from_email}
                        </span>
                        <span className="text-[10px] text-text3 ml-auto shrink-0">{fmtDate(msg.sent_at || msg.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-text3 truncate">{msg.subject || "(no subject)"}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
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
