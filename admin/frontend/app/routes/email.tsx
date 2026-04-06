import { useState, useRef, lazy, Suspense } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Inbox, Send, FileText, Trash2, Plus, ArrowLeft, Mail,
  Bold, Italic, Link, List, ListOrdered, Code, Heading,
  ChevronDown, Settings, Check, AlertTriangle, Archive,
  Reply, CornerUpLeft, Search, Paperclip, X, Download,
} from "lucide-react"
import { Label } from "~/components/ui/label"

// ── Types matching backend row shapes ──────────────────────────────────

interface Mailbox {
  id: string
  domain_id: string
  address: string
  local_part: string
  display_name: string
  mailbox_type: string
  status: string
  last_sync_at: number | null
}

interface ThreadRow {
  id: string
  mailbox_id: string
  subject_canonical: string
  last_message_at: number | null
  message_count: number
  participants_json: string[] | unknown
  created_at: number | null
}

interface AttachmentMeta {
  blobId: string
  name: string
  type: string
  size: number
}

interface MessageRow {
  id: string
  mailbox_id: string
  thread_id: string | null
  direction: string
  folder: string
  status: string
  from_address: string
  from_name: string
  to_addresses_json: string[] | unknown
  cc_addresses_json: string[] | unknown
  subject: string
  snippet: string
  text_body: string
  html_body: string
  read_at: number | null
  sent_at: number | null
  created_at: number | null
  attachments_json: AttachmentMeta[] | unknown
}

interface MailIdentity {
  mailboxId: string
  address: string
  displayName: string
  agentId: string
  agentName: string
  role: string
  isPrimary: boolean
}

type Folder = "inbox" | "sent" | "drafts" | "trash" | "archive"

const folderDefs: Array<{ id: Folder; label: string; icon: React.ElementType }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
]

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(ts: number | null) {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, "")
    .replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""')
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === "string") { try { return JSON.parse(val) } catch { return [] } }
  return []
}

function threadParticipants(thread: ThreadRow): string {
  const arr = parseJsonArray(thread.participants_json)
  if (arr.length === 0) return "Unknown"
  if (arr.length === 1) return arr[0]
  return `${arr[0]} +${arr.length - 1}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function parseAttachments(val: unknown): AttachmentMeta[] {
  if (Array.isArray(val)) return val as AttachmentMeta[]
  if (typeof val === "string") { try { return JSON.parse(val) } catch { return [] } }
  return []
}

// ── Main component ─────────────────────────────────────────────────────

function EmailContent() {
  const qc = useQueryClient()
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeData, setComposeData] = useState({ from: "", to: "", subject: "", body: "" })
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showMailboxPicker, setShowMailboxPicker] = useState(false)
  const [showSmtp, setShowSmtp] = useState(false)
  const [smtpForm, setSmtpForm] = useState<Record<string, string>>({})
  const [replyText, setReplyText] = useState("")
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [mailboxSearch, setMailboxSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const editorRef = useRef<HTMLDivElement>(null)

  // ── SMTP config (separate concern, keep) ──────────────────────────
  const { data: smtpData } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api<{ configured: boolean; host: string; port: number; user: string; hasPassword: boolean; fromName: string; fromEmail: string; replyTo: string }>("/api/admin/email/config"),
  })

  const saveSmtp = useMutation({
    mutationFn: (data: Record<string, string>) => api("/api/admin/email/config", { method: "PUT", json: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "email", "config"] }),
  })

  // ── Identities (for compose picker) ───────────────────────────────
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

  const primaryIdentity = identitiesQuery.data?.identities?.find(i => i.isPrimary)
  const defaultSenderId = primaryIdentity?.mailboxId ?? senders[0]?.id ?? ""
  const activeSender = senders.find(s => s.id === (composeData.from || defaultSenderId)) ?? senders[0]

  // ── Mailboxes ─────────────────────────────────────────────────────
  const mailboxesQuery = useQuery({
    queryKey: ["mail", "mailboxes"],
    queryFn: () => api<{ mailboxes: Mailbox[] }>("/api/v1/mail/mailboxes"),
  })

  const mailboxes = mailboxesQuery.data?.mailboxes ?? []

  // Auto-select first mailbox
  const activeMailboxId = selectedMailboxId ?? mailboxes[0]?.id ?? null
  const activeMailbox = mailboxes.find(m => m.id === activeMailboxId)

  // ── Folder counts ─────────────────────────────────────────────────
  const foldersQuery = useQuery({
    queryKey: ["mail", "folders", activeMailboxId],
    queryFn: () => api<{ mailboxId: string; folders: Record<string, number> }>(`/api/v1/mail/mailboxes/${activeMailboxId}/folders`),
    enabled: !!activeMailboxId,
    refetchInterval: 30_000,
  })

  const folderCounts = foldersQuery.data?.folders ?? {}

  // ── Threads ───────────────────────────────────────────────────────
  const threadsQuery = useQuery({
    queryKey: ["mail", "threads", activeMailboxId, activeFolder],
    queryFn: () => api<{ threads: ThreadRow[]; total: number }>(`/api/v1/mail/mailboxes/${activeMailboxId}/threads?folder=${activeFolder}&limit=50`),
    enabled: !!activeMailboxId,
    refetchInterval: activeFolder === "inbox" ? 15_000 : undefined,
  })

  const allThreads = threadsQuery.data?.threads ?? []
  const threads = searchQuery.trim()
    ? allThreads.filter(t => {
        const q = searchQuery.toLowerCase()
        return (t.subject_canonical || "").toLowerCase().includes(q)
          || threadParticipants(t).toLowerCase().includes(q)
      })
    : allThreads

  // ── Thread messages ───────────────────────────────────────────────
  const threadMessagesQuery = useQuery({
    queryKey: ["mail", "thread-messages", selectedThreadId, activeMailboxId],
    queryFn: () => api<{ messages: MessageRow[] }>(`/api/v1/mail/threads/${selectedThreadId}/messages?mailboxId=${activeMailboxId}`),
    enabled: !!selectedThreadId && !!activeMailboxId,
  })

  const threadMessages = threadMessagesQuery.data?.messages ?? []
  const selectedThread = threads.find(t => t.id === selectedThreadId)

  // ── Mark read on view ─────────────────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => api(`/api/v1/mail/messages/${messageId}/read`, { method: "POST", json: { mailboxId: activeMailboxId } }),
  })

  // Auto-mark unread messages as read when thread is viewed
  const markThreadMessagesRead = (messages: MessageRow[]) => {
    for (const msg of messages) {
      if (!msg.read_at && msg.direction === "inbound") {
        markReadMutation.mutate(msg.id, {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["mail", "folders", activeMailboxId] })
          },
        })
      }
    }
  }

  // ── Attachment state ───────────────────────────────────────────────
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentMeta[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("mailboxId", activeSender?.id ?? activeMailboxId ?? "")
      const res = await fetch("/api/v1/mail/attachments/upload", { method: "POST", body: formData, credentials: "include" })
      if (!res.ok) throw new Error("Upload failed")
      const json = await res.json()
      return json.data as AttachmentMeta
    },
    onSuccess: (att) => setPendingAttachments(prev => [...prev, att]),
  })

  // ── Send ──────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (data: { mailboxId: string; to: string[]; subject: string; textBody: string; htmlBody?: string; attachments?: AttachmentMeta[] }) => {
      setSelectedMailboxId(data.mailboxId)
      return api("/api/v1/mail/messages/send", { method: "POST", json: data })
    },
    onSuccess: () => {
      setComposing(false)
      setComposeData({ from: "", to: "", subject: "", body: "" })
      setPendingAttachments([])
      if (editorRef.current) editorRef.current.innerHTML = ""
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Draft ─────────────────────────────────────────────────────────
  const draftMutation = useMutation({
    mutationFn: (data: { mailboxId: string; to?: string[]; subject?: string; textBody?: string; htmlBody?: string }) =>
      api("/api/v1/mail/drafts", { method: "POST", json: data }),
    onSuccess: () => {
      setComposing(false)
      setComposeData({ from: "", to: "", subject: "", body: "" })
      setPendingAttachments([])
      if (editorRef.current) editorRef.current.innerHTML = ""
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Reply ─────────────────────────────────────────────────────────
  const replyMutation = useMutation({
    mutationFn: (data: { messageId: string; textBody: string }) =>
      api(`/api/v1/mail/messages/${data.messageId}/reply`, { method: "POST", json: { mailboxId: activeMailboxId, textBody: data.textBody } }),
    onSuccess: () => {
      setReplyText("")
      setReplyingToId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Archive ───────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}/archive`, { method: "POST", json: { mailboxId: activeMailboxId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Trash ─────────────────────────────────────────────────────────
  const trashMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}/trash`, { method: "POST", json: { mailboxId: activeMailboxId } }),
    onSuccess: () => {
      setSelectedThreadId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Permanent delete (from trash) ──────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}?mailboxId=${activeMailboxId}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedThreadId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────

  function execFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleSend(asDraft: boolean) {
    if (!activeSender) return
    const mailboxId = activeSender.id
    const html = editorRef.current?.innerHTML || ""
    const text = editorRef.current?.textContent || ""
    const toList = composeData.to.split(",").map(s => s.trim()).filter(Boolean)

    if (asDraft) {
      draftMutation.mutate({
        mailboxId,
        to: toList.length > 0 ? toList : undefined,
        subject: composeData.subject || undefined,
        textBody: text || undefined,
        htmlBody: html || undefined,
      })
    } else {
      if (!toList.length || !composeData.subject || !text) return
      sendMutation.mutate({
        mailboxId, to: toList, subject: composeData.subject, textBody: text, htmlBody: html,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      })
    }
  }

  function handleReply(messageId: string) {
    if (!replyText.trim()) return
    replyMutation.mutate({ messageId, textBody: replyText.trim() })
  }

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId)
    setComposing(false)
    // Mark messages read after a short delay to allow query to populate
    setTimeout(() => {
      const cached = qc.getQueryData<{ messages: MessageRow[] }>(["mail", "thread-messages", threadId])
      if (cached?.messages) markThreadMessagesRead(cached.messages)
    }, 500)
  }

  function handleArchiveThread() {
    // Archive all messages in the thread
    for (const msg of threadMessages) {
      if (msg.folder !== "archive") archiveMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  function handleTrashThread() {
    // Trash all messages in the thread
    for (const msg of threadMessages) {
      if (msg.folder !== "trash") trashMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  function handleDeleteThread() {
    // Permanently delete all messages in the thread
    for (const msg of threadMessages) {
      deleteMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  // ── Loading state ─────────────────────────────────────────────────
  if (mailboxesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const filteredMailboxes = mailboxSearch.trim()
    ? mailboxes.filter(mb => {
        const q = mailboxSearch.toLowerCase()
        return mb.display_name.toLowerCase().includes(q) || mb.address.toLowerCase().includes(q) || mb.local_part.toLowerCase().includes(q)
      })
    : mailboxes

  return (
    <div className="flex h-[calc(100vh-var(--header-height)-2rem)] px-4 pb-4">
      {/* SMTP config overlay */}
      {showSmtp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40" onClick={() => setShowSmtp(false)}>
          <div className="rounded-lg border border-border bg-card p-4 w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-text3">SMTP Configuration</p>
              <Button variant="ghost" size="xs" onClick={() => setShowSmtp(false)}>Close</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
        </div>
      )}

      {/* ── Left sidebar (folders only) ────────────────────────────── */}
      <div className="w-[160px] shrink-0 flex flex-col border-r border-border pr-2 mr-0">
        {/* Compose button */}
        <Button
          className="w-full gap-2 mb-3 h-9 text-sm font-medium"
          onClick={() => { setComposing(true); setSelectedThreadId(null) }}
        >
          <Plus className="size-4" /> Compose
        </Button>

        {/* Folder list */}
        <nav className="flex flex-col gap-0.5 flex-1 min-h-0">
          {folderDefs.map(f => {
            const count = folderCounts[f.id] ?? 0
            const isActive = activeFolder === f.id
            const Icon = f.icon
            return (
              <button
                key={f.id}
                onClick={() => { setActiveFolder(f.id); setSelectedThreadId(null); setComposing(false) }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-accent-porter/10 text-accent-porter font-semibold"
                    : "text-text2 hover:bg-raised"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{f.label}</span>
                {count > 0 && (
                  <span className={`text-xs ${isActive ? "text-accent-porter" : "text-text3"}`}>{count}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Thread list panel ─────────────────────────────────────── */}
      <div className="flex-1 min-w-[280px] max-w-[400px] border-r border-border overflow-y-auto">
        {/* Mailbox picker */}
        <div className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="relative px-3 py-2">
            <button
              onClick={() => { setShowMailboxPicker(!showMailboxPicker); setMailboxSearch("") }}
              className="flex w-full items-center gap-2 text-left"
            >
              <Mail className="size-3.5 text-accent-porter shrink-0" />
              <span className="text-sm font-semibold text-text truncate flex-1">{activeMailbox?.display_name || activeMailbox?.local_part || "Select mailbox"}</span>
              <ChevronDown className="size-3 text-text3 shrink-0" />
            </button>
            <span className="text-2xs text-text3 pl-5.5 block truncate mt-0.5 ml-[22px]">{activeMailbox?.address ?? ""}</span>
            {showMailboxPicker && (
              <div className="absolute top-full left-0 z-50 w-full rounded-b-lg border border-border border-t-0 bg-surface shadow-lg overflow-hidden">
                <div className="p-2 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-text3" />
                    <Input
                      value={mailboxSearch}
                      onChange={e => setMailboxSearch(e.target.value)}
                      className="h-7 text-xs pl-7"
                      placeholder="Search mailboxes..."
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {filteredMailboxes.length === 0 ? (
                    <p className="px-3 py-2 text-2xs text-text3">{mailboxSearch ? "No matches" : "No mailboxes"}</p>
                  ) : (
                    filteredMailboxes.map(mb => (
                      <button
                        key={mb.id}
                        onClick={() => { setSelectedMailboxId(mb.id); setShowMailboxPicker(false); setSelectedThreadId(null); setMailboxSearch("") }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised transition-colors ${mb.id === activeMailboxId ? "bg-accent-porter/10" : ""}`}
                      >
                        <Mail className={`size-3 shrink-0 ${mb.id === activeMailboxId ? "text-accent-porter" : "text-text3"}`} />
                        <div className="min-w-0 flex-1">
                          <span className={`text-xs block truncate ${mb.id === activeMailboxId ? "font-semibold text-accent-porter" : "text-text"}`}>{mb.display_name || mb.local_part}</span>
                          <span className="text-2xs text-text3 block truncate">{mb.address}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search + folder label */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/30">
            <span className="text-xs font-semibold text-text capitalize">{activeFolder}</span>
            {threadsQuery.data && <span className="text-2xs text-text3">({threadsQuery.data.total})</span>}
            {threadsQuery.isFetching && (
              <div className="size-2.5 animate-spin rounded-full border border-accent-porter border-t-transparent" />
            )}
            <div className="ml-auto relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-text3" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-6 text-2xs pl-6 w-[140px] bg-transparent"
                placeholder="Search..."
              />
            </div>
          </div>
        </div>

        {/* Thread rows */}
        {threadsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          </div>
        ) : !activeMailboxId ? (
          <div className="px-3 py-8 text-center text-xs text-text3">No mailbox selected</div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-text3">No threads in {activeFolder}</div>
        ) : (
          threads.map(thread => (
            <button
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left border-b border-border/30 hover:bg-raised/50 transition-colors ${
                thread.id === selectedThreadId ? "bg-accent-porter/5" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text truncate">{threadParticipants(thread)}</span>
                  {thread.message_count > 1 && (
                    <span className="text-2xs text-text3 shrink-0">({thread.message_count})</span>
                  )}
                  <span className="text-2xs text-text3 ml-auto shrink-0">{fmtDate(thread.last_message_at)}</span>
                </div>
                <p className="text-xs text-text2 truncate mt-0.5">{thread.subject_canonical || "(no subject)"}</p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* ── Thread detail / Compose / Empty state ─────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {composing ? (
          /* ── Compose view ─────────────────────────────────── */
          <div className="flex-1 flex flex-col">
            {/* Compose header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
              <div className="flex items-center gap-2">
                <button onClick={() => setComposing(false)} className="text-text3 hover:text-text2"><ArrowLeft className="size-3" /></button>
                <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Compose</span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-2xs" onClick={() => handleSend(true)} disabled={!activeSender || draftMutation.isPending}>
                  {draftMutation.isPending ? "Saving..." : "Draft"}
                </Button>
                <Button size="sm" className="h-6 text-2xs gap-1" onClick={() => handleSend(false)} disabled={!activeSender || sendMutation.isPending}>
                  <Send className="size-2.5" /> {sendMutation.isPending ? "Sending..." : "Send"}
                </Button>
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
                <span className="text-xs text-text3">No mailboxes provisioned. Set up agent mailboxes first.</span>
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
              <div className="w-px h-4 bg-border/50 mx-1" />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={e => {
                  const files = e.target.files
                  if (files) for (const f of Array.from(files)) uploadMutation.mutate(f)
                  e.target.value = ""
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex size-6 items-center justify-center rounded text-text3 hover:bg-raised hover:text-text2 transition-colors"
                title="Attach file"
              >
                <Paperclip className="size-3" />
              </button>
              {uploadMutation.isPending && (
                <div className="size-3 animate-spin rounded-full border border-accent-porter border-t-transparent ml-1" />
              )}
            </div>

            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-b border-border/50 bg-background/30">
                {pendingAttachments.map((att, i) => (
                  <span key={att.blobId + i} className="flex items-center gap-1 px-2 py-0.5 rounded border border-border text-2xs text-text2 bg-raised">
                    <Paperclip className="size-2.5 text-text3" />
                    <span className="max-w-[120px] truncate">{att.name}</span>
                    <span className="text-text3">({formatFileSize(att.size)})</span>
                    <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} className="text-text3 hover:text-danger">
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Rich editor */}
            <div
              ref={editorRef}
              contentEditable
              className="flex-1 p-3 text-xs text-text bg-background resize-none focus:outline-none overflow-y-auto [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-1 [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
              suppressContentEditableWarning
              data-placeholder="Write your message..."
            />
          </div>
        ) : selectedThreadId && selectedThread ? (
          /* ── Thread detail view ───────────────────────────── */
          <div className="flex-1 flex flex-col">
            {/* Thread header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
              <p className="text-sm font-bold text-text truncate">{selectedThread.subject_canonical || "(no subject)"}</p>
              <div className="flex gap-1 shrink-0">
                {activeFolder === "trash" ? (
                  <Button variant="ghost" size="sm" className="h-6 text-2xs text-danger" onClick={handleDeleteThread}>
                    <Trash2 className="size-2.5 mr-1" /> Delete forever
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 text-2xs" onClick={handleArchiveThread}>
                      <Archive className="size-2.5 mr-1" /> Archive
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-2xs text-danger" onClick={handleTrashThread}>
                      <Trash2 className="size-2.5 mr-1" /> Trash
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Thread meta */}
            <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2">
              <span className="text-2xs text-text3">{selectedThread.message_count} message{selectedThread.message_count !== 1 ? "s" : ""}</span>
              <span className="text-2xs text-text3">{threadParticipants(selectedThread)}</span>
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto">
              {threadMessagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-text3">No messages in this thread</div>
              ) : (
                threadMessages.map((msg, idx) => (
                  <div key={msg.id} className={`px-3 py-3 ${idx > 0 ? "border-t border-border/30" : ""}`}>
                    {/* Message header */}
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`text-2xs border-0 ${msg.direction === "inbound" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                        {msg.direction === "inbound" ? "In" : "Out"}
                      </Badge>
                      <span className="text-xs font-medium text-text">{msg.from_name || msg.from_address}</span>
                      <span className="text-2xs text-text3">&lt;{msg.from_address}&gt;</span>
                      <span className="text-2xs text-text3 ml-auto">{fmtDate(msg.sent_at || msg.created_at)}</span>
                    </div>
                    {/* To line */}
                    <div className="flex items-center gap-1 mb-2 text-2xs text-text3">
                      <span>To:</span>
                      <span className="text-text2">{parseJsonArray(msg.to_addresses_json).join(", ") || "—"}</span>
                    </div>
                    {/* Body */}
                    {msg.html_body ? (
                      <div className="text-xs text-text2 leading-relaxed [&_h3]:text-sm [&_h3]:font-bold [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.html_body) }} />
                    ) : (
                      <div className="text-xs text-text2 leading-relaxed whitespace-pre-wrap">{msg.text_body || "(empty)"}</div>
                    )}
                    {/* Attachments */}
                    {parseAttachments(msg.attachments_json).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {parseAttachments(msg.attachments_json).map((att, ai) => (
                          <a
                            key={att.blobId + ai}
                            href={`/api/v1/mail/attachments/${msg.mailbox_id}/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.name || "attachment")}`}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1.5 px-2 py-1 rounded border border-border text-2xs text-text2 hover:bg-raised transition-colors"
                          >
                            <Download className="size-3 text-text3" />
                            <span className="max-w-[160px] truncate">{att.name || "attachment"}</span>
                            <span className="text-text3">({formatFileSize(att.size)})</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {/* Per-message reply button */}
                    {msg.direction === "inbound" && (
                      <div className="mt-2">
                        {replyingToId === msg.id ? (
                          <div className="flex gap-2 items-end">
                            <Input
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              className="h-7 text-xs flex-1"
                              placeholder="Type your reply..."
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(msg.id) } }}
                            />
                            <Button size="sm" className="h-7 text-2xs gap-1" onClick={() => handleReply(msg.id)} disabled={replyMutation.isPending || !replyText.trim()}>
                              <Send className="size-2.5" /> {replyMutation.isPending ? "..." : "Reply"}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-2xs" onClick={() => { setReplyingToId(null); setReplyText("") }}>Cancel</Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setReplyingToId(msg.id); setReplyText("") }}
                            className="flex items-center gap-1 text-2xs text-text3 hover:text-accent-porter transition-colors"
                          >
                            <CornerUpLeft className="size-2.5" /> Reply
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Bottom reply bar */}
            <div className="shrink-0 border-t border-border bg-surface px-3 py-2 flex gap-2 items-center">
              <Reply className="size-3 text-text3 shrink-0" />
              <Input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="h-7 text-xs flex-1"
                placeholder="Quick reply..."
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    const target = [...threadMessages].reverse().find(m => m.direction === "inbound") ?? threadMessages[threadMessages.length - 1]
                    if (target && replyText.trim()) handleReply(target.id)
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 text-2xs gap-1"
                disabled={replyMutation.isPending || !replyText.trim()}
                onClick={() => {
                  const target = [...threadMessages].reverse().find(m => m.direction === "inbound") ?? threadMessages[threadMessages.length - 1]
                  if (target) handleReply(target.id)
                }}
              >
                <Send className="size-2.5" /> Reply
              </Button>
            </div>
          </div>
        ) : (
          /* ── Empty state ────────────────────────────────────── */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail className="size-8 text-text3/30 mx-auto mb-2" />
              <p className="text-sm text-text3">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const LazyMailOps = lazy(() => import("~/components/mail-ops").then(m => ({ default: m.MailOps })))

export default function EmailPage() {
  const [view, setView] = useState<"email" | "ops">("email")
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-border bg-background">
        <button onClick={() => setView("email")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "email" ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>
          Email
        </button>
        <button onClick={() => setView("ops")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "ops" ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>
          Mail Ops
        </button>
      </div>
      {view === "email" ? (
        <EmailContent />
      ) : (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>}>
          <LazyMailOps />
        </Suspense>
      )}
    </div>
  )
}
